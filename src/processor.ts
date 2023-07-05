import { visitParents } from "unist-util-visit-parents";
import { unified, Transformer, Attacher } from "unified";
import gfm from "remark-gfm";
import parse from "remark-parse";
import remark2rehype, { all } from "remark-rehype";
import rehype2remark from "rehype-remark";
import stringify from "remark-stringify";
import raw from "rehype-raw";
import remarkFrontmatter from "remark-frontmatter";
import { Element, RootContent } from "hast";
import {
  Attributes,
  Layout,
  LayoutElement,
  LayoutNode,
  Segment,
  Document,
  Processor,
} from "./types";
import { Root as MdastRoot } from "mdast";
import { Root as HastRoot } from "hast";
import { removePosition } from "unist-util-remove-position";
import img from "./handlers/hast-to-mdast/img.js";
import yaml from "./handlers/yaml-to-hast/yaml.js";
import cheerio from 'cheerio';

const convertMdastTagToHast = (tag: string) => {
  const tagsMap: Record<string, string> = {
    link: "a",
    inlineCode: "code",
    emphasis: "em",
  };

  return tagsMap[tag] ? tagsMap[tag] : tag;
};

const convertMdastAttributesToHast = (attributes: any) => {
  let newAttributes: Attributes = {};
  const attributesMapLinks: Record<string, string> = {
    url: "href",
  };
  const attributesMapImg: Record<string, string> = {
    url: "src",
  };

  for (const key in attributes) {
    if (attributes.hasOwnProperty(key)) {
      const innerObject = attributes[key];
      const transformedInnerObject: any = {};
      const attributesMap = key.includes("image")
        ? attributesMapImg
        : attributesMapLinks;

      for (const innerKey in innerObject) {
        if (innerObject.hasOwnProperty(innerKey)) {
          if (attributesMap.hasOwnProperty(innerKey)) {
            transformedInnerObject[attributesMap[innerKey]] =
              innerObject[innerKey];
          } else {
            transformedInnerObject[innerKey] = innerObject[innerKey];
          }
        }
      }

      newAttributes[key] = transformedInnerObject;
    }
  }

  return newAttributes;
};

const allowedTagsRegex = /^\/?[a-zA-Z]+\d+$/;


function parseHTMLTags(html: string) {
  const $ = cheerio.load(html);
  let tagName = ''
  let htmlAttributes = {}

  $('body').children().each((index, element: any) => {
    tagName = $(element).prop('tagName')?.toLowerCase() || '';
    htmlAttributes = $(element).get(0).attribs;
  });

  return {tagName, htmlAttributes}
}

function convertMdastNodeToText(node: any) {
  let resultNodeText = "";
  let tagCount = 0;
  let attributes: Attributes = {};
  const htmlTags: number[] = [];

  const nodeToString = (node: any): string => {
    const tag = convertMdastTagToHast(node.type);
    let tagNameWithIndex = "";

    if (node.type === "html") {
      let value = ''
      const {tagName, htmlAttributes} = parseHTMLTags(node.value)
      const openingTag = /^<(\w+)>$/;
      const closingTag = /^<\/\w+>$/;
      let tagCountTemp = tagCount;

      if (closingTag.test(node.value)) {
        tagCountTemp = htmlTags.pop()!;
        const tagName = node.value.replace(/[<>]/g, "");
        value = `{${tagName}${tagCountTemp}}`;
      }

      if (tagName) {
        value = `{${tagName}${tagCountTemp}}`;
        attributes[tagName + tagCountTemp] = { ...htmlAttributes };
        htmlTags.push(tagCount);
        tagCount++;
      }

      return value;
    }

    if (node.type === "footnoteReference") {
      return `[^${node.label}]`;
    }

    if ("children" in node) {
      const tagCountTemp = tagCount;

      tagNameWithIndex = tag + tagCountTemp;
      setAttributes(node, tagNameWithIndex);
      tagCount++;

      const content = node.children.map(nodeToString).join("");

      return `{${tag}${tagCountTemp}}${content}{/${tag}${tagCountTemp}}`;
    } else if ("value" in node || node.type === "image") {
      if (tag !== "text") {
        tagNameWithIndex = tag + tagCount;

        setAttributes(node, tagNameWithIndex);

        const value = `{${tag}${tagCount}}${
          node.value || ""
        }{/${tag}${tagCount}}`;

        tagCount++;

        return value;
      } else {
        return node.value;
      }
    } else {
      return "";
    }
  };

  const setAttributes = (child: any, tag: string): void => {
    if (child.url || child.title || child.alt || child.marker) {
      const attr: any = {};

      if (child.url) {
        attr.url = child.url;
      }

      if (child.title) {
        attr.title = child.title;
      }

      if (child.alt) {
        attr.alt = child.alt;
      }

      if (child.marker) {
        attr.marker = child.marker;
      }

      attributes[tag] = { ...attributes[tag], ...attr };
    }
  };

  if (node.children.length === 1 && node.children[0].type === "inlineCode") {
    return node.children[0];
  }

  resultNodeText = node.children.map(nodeToString).join("");

  if (resultNodeText) {
    return {
      type: "text",
      value: resultNodeText,
      attributes:
        Object.keys(attributes).length > 0
          ? { attributes: JSON.stringify(attributes) }
          : {},
    };
  }

  return null;
}

function parseStringToStructure(segment: Segment): Element[] {
  const text: string = segment.text;
  const stack = [];
  let currentText: string = "";
  let properties: any = {};

  for (let i = 0; i < text.length; i++) {
    if (
      text[i] === "{" &&
      allowedTagsRegex.test(text.substring(i + 1, text.indexOf("}", i + 1)))
    ) {
      if (currentText !== "") {
        stack.push({
          type: "text",
          value: currentText,
        });
        currentText = "";
      }

      const closingIndex: number = text.indexOf("}", i + 1);
      const tagWithIndex: string = text.substring(i + 1, closingIndex);
      const tag: string = tagWithIndex.replace(/\d/g, "");

      if (tag.startsWith("/")) {
        const closingTag: string = tag.substring(1);
        const elements = [];

        while (stack.length > 0) {
          const element: any = stack.pop();
          if (element.type === "element" && element.tagName === closingTag) {
            element.children = elements;
            stack.push(element);
            break;
          }
          elements.unshift(element);
        }
      } else {
        if (segment.attributes) {
          properties = segment.attributes[tagWithIndex];
        }

        let element: any = {
          type: "element",
          tagName: tag,
          properties: properties,
          children: [],
        };
        if(properties?.marker) element.marker = properties.marker
        stack.push(element);
      }

      i = closingIndex;
    } else {
      currentText += text[i];
    }
  }

  if (currentText !== "") {
    stack.push({
      type: "text",
      value: currentText,
    });
  }

  return stack;
}
const keepMarkerPlugin: Attacher = (option: any) => {
  const {doc} = option
  const transformer: Transformer = (ast, _) => {
    visitParents(ast, node => ["emphasis", "code", "html"].includes(node.type), (node: any, parent) => {
      const marker = doc.charAt(node.position?.start?.offset);
      node.marker = marker;
    });
  }
  return transformer;
};

class MdProcessor implements Processor {
  public parse(doc: string) {
    const mdast = unified()
      .use(parse)
      .use(remarkFrontmatter, ["yaml"])
      .use(gfm)
      .parse(doc);

    const hast = unified()
      .use(keepMarkerPlugin, {doc: doc})
      .use(remark2rehype, {
        allowDangerousHtml: true,
        handlers: {
          code: (h, node, parent) => {
            const properties: any = {};
            if(node.lang) properties.lang = node.lang;
            if(node.meta) properties.meta = node.meta;

            return {
              type: 'element',
              tagName: 'pre',
              properties: {},
              children: [
                {
                  properties,
                  type: 'element',
                  tagName: 'code',
                  children: [
                    { type: 'text', value: node.value }
                  ]
                }
              ]
            }
          },
          paragraph: (state, node) => {
            const segment: any = convertMdastNodeToText(node);
            node.children = segment ? [segment] : [];

            return {
              type: "element",
              tagName: "p",
              properties: segment?.attributes || {},
              children: state.all(node),
            };
          },
          tableRow: (state, node) => {
            visitParents(node, { type: "tableCell" }, (child, parent) => {
              const segment: any = convertMdastNodeToText(child);

              child.children = segment ? [segment] : [];
            });

            return {
              type: "element",
              tagName: "tr",
              properties: {},
              children: state.all(node),
            };
          },
          yaml: (h, node, parent) => yaml.stringToHast(node.value),
          footnoteReference: (h, node, parent) => {
            return { type: "text", value: `[^${node.label}]` };
          },
          footnoteDefinition: (h, node, parent) => {
            const paragraphLevel = node.children[0];
            const paragraphLevelChildrenInHast: any[] = all(h, paragraphLevel);
            const footnoteLabel = `[^${node.label}]: `;
            const children = [
              { type: "text", value: footnoteLabel },
              ...paragraphLevelChildrenInHast,
            ];
            return {
              type: "element",
              tagName: "p",
              children,
              properties: {},
            };
          },
          listItem: (h, node, parent) => {
            let listItemChildren = all(h, node);
            const isTaskItem = node.checked !== null;
            if (isTaskItem) {
              const checkBox = `[${node.checked ? `x` : ` `}] `;
              const paragraph = listItemChildren[0];
              if ("children" in paragraph) {
                const textNode = paragraph.children[0];
                if ("value" in textNode)
                  textNode.value = `${checkBox} ${textNode.value}`;
              }
            }
            return {
              ...node,
              tagName: "li",
              type: "element",
              children: listItemChildren,
            };
          },
        },
      })
      .use(raw, { passThrough: ["yaml"] })
      .runSync(mdast);

    const hastWithoutPosition = removePosition(hast);

    return this.hastToSegments(hastWithoutPosition);
  }

  public stringify(data: Document): string {
    const hast: HastRoot = this.segmentsToHast(data);

    const mdast: MdastRoot = unified()
      .use(rehype2remark, {
        newlines: true,
        handlers: {
          pre: (h, node, parent) => {
            const isPreCodeWrapper = node.children.length === 1 && node.children[0].tagName === 'code';
            if(isPreCodeWrapper) {
              const codeNode = node.children[0];
              return  {
                type: "code",
                value: codeNode.children[0].value,
                meta: codeNode.properties.meta,
                lang: codeNode.properties.lang,
              }
            } else {
              const textNode = node.children[0];
              return {
                type: "code",
                value: textNode.value,
              }
            }
          },
          img: (h, node, parent) => img(node, parent),
          yaml: (h, node, parent) => {
            const result = yaml.hastToString(node);
            return {
              type: "paragraph",
              position: undefined,
              children: [
                {
                  type: "text",
                  value: result,
                },
              ],
            };
          },
          em: (h: any, node, parent) => {
            let mdast: any = unified().use(rehype2remark, {newlines: true}).runSync(node)

            if(node.marker) mdast.marker = node.marker;
            return mdast;
          },
        },
      })
      .runSync(hast) as MdastRoot;

    return unified()
      .use(gfm)
      .use(stringify, {
        handlers: {
          text: (node) => node.value,
          emphasis: (node, _, state, info) => {
            const marker = node.marker || state.options.emphasis || "<em>";
            const exit = state.enter('emphasis')
            const tracker = state.createTracker(info)
            let value = tracker.move(marker)
            value += tracker.move(
              state.containerPhrasing(node, {
                before: value,
                after: marker,
                ...tracker.current()
              })
            )
            value += tracker.move(marker === "<em>" ? "</em>" : marker)
            exit()
            return value
          },
        },
      })
      .stringify(mdast) as string;
  }

  private hastToSegments(tree: HastRoot): Document {
    const segments: Segment[] = [];
    const layoutTemp: Layout = { type: "root", children: [] };
    const layout: Layout = { type: "root", children: [] };
    let segmentCount: number = 0;

    const addSegment = (node: LayoutElement): string => {
      let segment: Segment = {
        id: segmentCount.toString(),
        text: node.value || "",
      };

      if (node.attributes) {
        segment.attributes = node.attributes;
      }

      segments.push(segment);
      segmentCount++;
      return segment.id;
    };

    const convertNode = (node: LayoutNode): LayoutNode => {
      if (node.type === "text") {
        if (node.value?.trim() === "") {
          return node;
        } else {
          return { type: "segment", id: addSegment(node) };
        }
      }

      if (node.type === "element" || node.type === "yaml") {
        const children = node.children.map(convertNode);

        return {
          ...node,
          children: children,
        };
      }

      if (node.type === "comment") return node;

      throw new Error(`Unsupported node type: ${node.type}`);
    };

    tree.children.forEach((child: any) => {
      if (child.properties?.attributes) {
        child.children[0].attributes = convertMdastAttributesToHast(
          JSON.parse(child.properties.attributes)
        );
        delete child.properties.attributes;
      }

      layout.children.push(convertNode(child));
    });

    return { layout, segments };
  }

  private segmentsToHast(data: Document): HastRoot {
    visitParents(data.layout, { type: "segment" }, (node: any, parent) => {
      const structure = parseStringToStructure(data.segments[node.id]);
      let parentTemp = parent[parent.length - 1];
      const indexElement = parentTemp.children.findIndex(
        (child: any) => child.id === node.id
      );

      if (parentTemp.children.length === 1) {
        if (parentTemp.tagName === "img") {
          parentTemp.children = structure[0].children;
          parentTemp.properties = structure[0].properties;
        } else {
          parentTemp.children = structure;
        }
      } else {
        parentTemp.children[indexElement] =
          structure.length > 1 ? structure : structure[0];
      }
    });

    return data.layout as HastRoot;
  }
}

export default MdProcessor;
