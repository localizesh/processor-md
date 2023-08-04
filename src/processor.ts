import { visitParents } from "unist-util-visit-parents";
import { unified, Transformer, Attacher } from "unified";
import gfm from "remark-gfm";
import parse from "remark-parse";
import remark2rehype, { all } from "remark-rehype";
import rehype2remark, {all as toMdastAll} from "rehype-remark";
import stringify from "remark-stringify";
import raw from "rehype-raw";
import remarkFrontmatter from "remark-frontmatter";
import { Element, Root as HastRoot } from "hast";
import {
  Attributes,
  Document,
  Layout,
  LayoutElement,
  LayoutNode,
  Processor,
  Segment,
} from "./types";
import { Root as MdastRoot } from "mdast";
import { removePosition } from "unist-util-remove-position";
import img from "./handlers/hast-to-mdast/img.js";
import yaml from "./handlers/yaml-to-hast/yaml.js";
import cheerio from "cheerio";
import {listToMdast, ListTypes, linkHastToMdast, tableHastToMdast, divHastToMdast} from "./handlers/hast-to-mdast/handlers.js";
import {toHtml} from "hast-util-to-html";
import {segmentParentNodeToHast} from "./handlers/mdast-to-hast/handlers.js";
import {hastToString} from "./utils/hast.js";


const regexCodeBlock: RegExp = /<code\b(?![^`]*`)[^>]*>(.*?)<\/code>/gs;
const regexPreBlock: RegExp = /<pre\b(?![^`]*`)[^>]*>(.*?)<\/pre>/gs;
const replacedStrings: string[] = [];
const allowedTagsRegex: RegExp = /^\/?[a-zA-Z]+\d+$/;
let replacementIndex = 0;

const convertMdastTagToHast = (tag: string) => {
  const tagsMap: Record<string, string> = {
    link: "a",
    inlineCode: "code",
    emphasis: "em",
    image: "img",
    linkReference: "a"
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
      const attributesMap = key.includes("img")
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

function parseHTMLTags(html: string) {
  const $ = cheerio.load(html);
  let tagName = "";
  let htmlAttributes = {};

  $("body")
    .children()
    .each((index, element: any) => {
      tagName = $(element).prop("tagName")?.toLowerCase() || "";
      htmlAttributes = $(element).get(0).attribs;
    });

  return { tagName, htmlAttributes };
}

function convertMdastNodeToText(node: any, mdast?: any) {
  let resultNodeText = "";
  let tagCount = 0;
  let attributes: Attributes = {};
  const htmlTags: number[] = [];

  const nodeToString = (node: any): string => {

    if(node.type === "linkReference" && mdast) {
      visitParents(mdast, mdastChild =>
        mdastChild.type === "definition" && ("identifier" in mdastChild && mdastChild.identifier === node.identifier), (definition: any, _) => {
        node.url = definition.url;
        debugger
      });
    }

    const tag = convertMdastTagToHast(node.type);
    let tagNameWithIndex = "";

    if (node.type === "html") {
      let value = "";
      const { tagName, htmlAttributes } = parseHTMLTags(node.value);
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
        if(node.marker) attributes[tagName + tagCountTemp].marker = node.marker;
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
        let value: string
        tagNameWithIndex = tag + tagCount;

        setAttributes(node, tagNameWithIndex);

        if(node.type === "image"){
          value = `{${tag}${tagCount}}`;
        } else {
          value = `{${tag}${tagCount}}${node.value || ""}{/${tag}${tagCount}}`;
        }

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
    if (child.url || child.title || child.alt || child.marker || child.identifier) {
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

      if (child.identifier) {
        attr.identifier = child.identifier;
      }

      attributes[tag] = { ...attributes[tag], ...attr };
    }
  };

  if (node.children.length === 1 && node.children[0].type === "inlineCode") {
    return node;
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

        const element = {
          type: "element",
          tagName: tag,
          properties: properties,
          children: [],
        };

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
    visitParents(ast, node =>
      ["emphasis", "code", "inlineCode", "strong", "list", "image", "link", "table", "html", "thematicBreak"].includes(node.type), (node: any, parent) => {
      let marker = doc.charAt(node.position?.start?.offset);
      if(node.type === "strong") marker+=marker;
      if(node.type === "list") {
        marker += doc.charAt(node.position?.start?.offset + 1).trim();
        if(marker.length > 1) marker = marker[marker.length -1];
      }
      if(node.type === "html") marker = "html";
      node.marker = marker;
    });
  }
  return transformer;
};

const prepareMdast: Attacher = () => {
  const transformer: Transformer = (ast, _) => {
    visitParents(ast, node => ["link"].includes(node.type), (node: any, parent) => {

      const isLinkUrlLAndLinkTextHasSameValue: boolean =
        node.url === node?.children[0]?.value && node.type === "link" && node.marker === "h";

      if(isLinkUrlLAndLinkTextHasSameValue) {
        node.type = "text";
        node.value = node?.children[0].value;
        delete node.children;
      }

    });
  }
  return transformer;
};

const convertToHtmlType: Attacher = () => {
  const transformer: Transformer = (ast, _) => {
    visitParents(ast, node => "properties" in node, (node: any, parent) => {
      if(node?.properties?.marker === "html") {
        let properties = {...node.properties};
        delete properties.marker;
        visitParents(node, child => "properties" in child && node !== child, (child: any, _) => delete child?.properties?.marker);
        const value: string = toHtml({...node, properties},  {allowDangerousCharacters: true, allowDangerousHtml: true} )
        node.type = "text";
        node.value = value;
      }
    });
  }
  return transformer;
};

const cutBlockFromDoc = (inputString: string, regex: RegExp) => {
  const replacementTemplate: string = "GL_CODE_BLOCK_";

  return inputString.replace(regex, (match, group) => {
    const content = group.trim();
    replacedStrings.push(content);
    const replacement: string = match.replace(
      content,
      `${replacementTemplate}${replacementIndex}`
    );
    replacementIndex++;
    return replacement;
  });
};

const pastCodeBlockToHast = (hast: HastRoot) => {
  visitParents(hast, { type: "text" }, (child: any) => {
    child.value = extractNumberFromGLCodeBlockString(child.value);
  });
};

const extractNumberFromGLCodeBlockString = (inputString: string): string => {
  const regex = /GL_CODE_BLOCK_(\d+)/;
  let match;

  while ((match = regex.exec(inputString)) !== null) {
    if (match && match.length > 1) {
      const numberString = parseInt(match[1], 10);
      inputString = inputString.replace(
        match[0],
        replacedStrings[numberString]
      );
    }
  }

  return inputString;
};

class MdProcessor implements Processor {
  public parse(doc: string) {
    let modifiedDoc: string = cutBlockFromDoc(doc, regexPreBlock);

    modifiedDoc = cutBlockFromDoc(modifiedDoc, regexCodeBlock);

    const mdast = unified()
      .use(parse)
      .use(remarkFrontmatter, ["yaml"])
      .use(gfm)
      .parse(modifiedDoc);

    const hast = unified()
      .use(keepMarkerPlugin, {doc: doc})
      .use(prepareMdast)
      .use(remark2rehype, {
        passThrough: ["definition"],
        allowDangerousHtml: true,
        handlers: {
          code: (h, node, parent) => {
            const properties: any = {};
            if (node.lang) properties.lang = node.lang;
            if (node.meta) properties.meta = node.meta;

            let codeElement: any =  {
              properties,
              type: "element",
              tagName: "code",
              children: [
                { type: "text", value: node.value }
              ]
            }
            if(node.marker) properties.marker = node.marker;

            return {
              type: "element",
              tagName: "pre",
              properties: {},
              children: [codeElement]
            }
          },
          paragraph: (state, node) => {
            const segment: any = convertMdastNodeToText(node, mdast);
            const tagName: string = "p";
            return segmentParentNodeToHast(state, node, segment, tagName);
          },
          heading: (state, node) => {
            const segment: any = convertMdastNodeToText(node);
            const tagName: string = "h" + node.depth;
            return segmentParentNodeToHast(state, node, segment, tagName);
          },
          tableRow: (state, node, parent) => {
            const cells: any[] = []
            visitParents(node, { type: "tableCell" }, (child) => {
              const segment: any = convertMdastNodeToText(child);
              let cell: any

              if(segment !== null && segment.type !== "text"){
                cell = state.one(segment, parent)
                cell.children[0].properties.marker = segment.children[0].marker
              } else {
                cell = state.one(child, parent)
                cell.properties = segment?.attributes || {}
                cell.children = segment ? [segment] : [];
              }

              cells.push(cell)
            });

            return {
              type: "element",
              tagName: "tr",
              properties: {},
              children: cells,
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
                  textNode.value = `${checkBox} ${textNode.value.trim()}`;
              }
            }
            return {
              ...node,
              tagName: "li",
              type: "element",
              children: listItemChildren,
            };
          },
          list: (h, node, parent) => {
            const properties: any = {
              spread: node.spread.toString(),
              start: node.start,
            };
            if (node.marker) properties.marker = node.marker;
            return {
              type: "element",
              tagName: typeof node.start === "number" ?
                ListTypes.ol : ListTypes.ul,
              properties,
              children: all(h, node),
            }
          },
          table: (h, node, parent) => {
            const properties: any = {align: node.align};
            if (node.marker) properties.marker = node.marker;
            return {
              type: "element",
              tagName: "table",
              properties,
              children: all(h, node),
            }
          },
          thematicBreak: (h, node, parent) => {
            return {
              properties: {...node.properties, marker: node.marker || ""},
              type: "element",
              tagName: "hr",
              children: [],
            }

          },
          definition: (h, node, parent) => node,
        },
      })
      .use(raw, { passThrough: ["yaml", "definition"] })
      .runSync(mdast);

    pastCodeBlockToHast(hast);

    const {layout, segments} = this.hastToSegments(hast);
    return {layout: removePosition(layout), segments};
  }

  public stringify(data: Document): string {
    const hast: HastRoot = this.segmentsToHast(data);

    const mdast: MdastRoot = unified()
      .use(convertToHtmlType)
      .use(rehype2remark, {
        newlines: true,
        handlers: {
          pre: (h, node, parent) => {
            const isPreCodeWrapper =
              node.children.length === 1 && node.children[0].tagName === "code";
            if (isPreCodeWrapper) {
              const codeNode = node.children[0];
              return {
                type: "code",
                value: codeNode.children[0].value,
                meta: codeNode.properties.meta,
                lang: codeNode.properties.lang || 'no_lang',
                marker: codeNode.properties?.marker,
              }
            } else {
              const htmlValue = toHtml(node, {allowDangerousCharacters: true, allowDangerousHtml: true});
              return {
                properties: node.properties,
                type: "html",
                value:  htmlValue,
              };
            }
          },
          code: (h, node, parent) => {
            const inlineCode: any = {
              properties: node.properties,
              type: "inlineCode",
              children: toMdastAll(h, node),
            };
            return inlineCode;
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
          em: (h, node, parent) => {
            let emphasis: any = {
              properties: node.properties,
              type: "emphasis",
              children: toMdastAll(h, node),
            };
            return emphasis;
          },
          strong: (h, node, parent) => {
            let strong: any = {
              properties: node.properties,
              type: "strong",
              children: toMdastAll(h, node),
            };
            return strong;
          },
          ol: (h, node, parent) => listToMdast(h, node, ListTypes.ol),
          ul: (h, node, parent) => listToMdast(h, node, ListTypes.ul),
          a: (h, node, parent) => linkHastToMdast(h, node, hast),
          table: (h, node, parent) => tableHastToMdast(h, node),
          div: (h, node, parent) => divHastToMdast(h, node),
          hr:  (h, node, parent) => {
            return { type: "thematicBreak", properties: node.properties };
          },
          definition:  (h, node, parent) => node,
        },
      })
      .runSync(hast) as MdastRoot;

    return unified()
      .use(gfm)
      .use(stringify, {
        handlers: {
          text: (node) => node.value,
          code: (node, _, state, info) => {
            const marker = node.marker?.trim() ? node.marker.repeat(3) : "";

            const codeIndented: any = {
              ...node,
              lang: marker,
              type: "code",
              children: [{type: "text", value: node.value}]
            }

            if(!marker) {
              const strCode = unified().use(stringify).stringify(codeIndented);
              return strCode.trimRight();
            }
            const exit = state.enter("codeIndented");
            const lineBreak = marker ? "\n" : "";
            const tracker = state.createTracker(info);

            let value = tracker.move(
              marker +
              (node.lang === "no_lang" ? '' : node.lang) +
              (marker ? " " : "") +
              (node.meta ? node.meta : '')
              + lineBreak
            );
            value += state.containerPhrasing(codeIndented, {
              before: value,
              after: marker,
              ...tracker.current()
            });
            value += tracker.move(lineBreak + marker);

            exit();
            return value;
          },
          emphasis: (node, _, state, info) => {
            const marker = node.properties?.marker || state.options.emphasis || "<em>";

            const exit = state.enter('emphasis');
            const tracker = state.createTracker(info);
            let value = tracker.move(marker);
            value += tracker.move(
              state.containerPhrasing(node, {
                before: value,
                after: marker,
                ...tracker.current()
              })
            );
            value += tracker.move(marker === "<em>" ? "</em>" : marker);
            exit();
            return value;
          },
          link: (node, _, state, info) => {
            const exit = state.enter('link');
            const tracker = state.createTracker(info);
            let value = tracker.move("[");
            value += tracker.move(
              state.containerPhrasing(node, {
                before: value,
                after: "]",
                ...tracker.current()
              })
            );
            value += tracker.move("](" + node.url + ")");
            exit();
            return value;
          },
          inlineCode: (node, _, state, info) => {
            const marker = node.properties?.marker || "<code>";

            const exit = state.enter('blockquote');
            const tracker = state.createTracker(info);
            let value = tracker.move(marker);
            value += tracker.move(
              state.containerPhrasing(node, {
                before: value,
                after: marker,
                ...tracker.current()
              })
            );
            value += tracker.move(marker === "<code>" ? "</code>" : marker);
            exit();
            return value;
          },
          strong: (node, _, state, info) => {
            let marker = node.properties?.marker || "<strong>";

            const exit = state.enter('strong');
            const tracker = state.createTracker(info);
            let value = tracker.move(marker);
            value += tracker.move(
              state.containerPhrasing(node, {
                before: value,
                after: marker,
                ...tracker.current()
              })?.trimRight()
            );
            value += tracker.move(marker === "<strong>" ? "</strong>" : marker);
            exit();
            return value;
          },
          list: (node, _, state, info) => {
            const marker = node.properties?.marker || node.marker;

            const exit = state.enter('list');
            const tracker = state.createTracker(info);

            state.bulletCurrent = marker;
            state.options.listItemIndent = "one";

            let value = tracker.move(
                state.containerFlow(node, {
                  ...info,
                })
            )
            exit();
            return value;
          },
          thematicBreak: (node, parent, state) => {
            let marker = node?.properties.marker;
            if (marker !== '-' && marker !== '_') marker = '*';
            const value = marker.repeat(3);

            return state.options.ruleSpaces ? value.slice(0, -1) : value;
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

      if (node.type === "comment" || node.type === "definition") return node;

      throw new Error(`Unsupported node type: ${node.type}`);
    };

    tree.children.forEach((child: any) => {
      visitParents(child, { type: "element" }, (node: any) => {
        if (node.properties?.attributes) {
          node.children[0].attributes = convertMdastAttributesToHast(
            JSON.parse(node.properties.attributes)
          );

          delete node.properties.attributes;
        }

        if(node.tagName === "td" || node.tagName === "th") {
          if(node.children.length > 1 && node.children.some((el: any) => el.type === "element")) {
            const {text, attributes} = hastToString(node);

            if(text) {
              node.children = [{type: "text", value: text, attributes}];
            }
          }
        }

        if((node.tagName === "img" || node.tagName === "a") && node.children.length === 0) {
          const tagName: string = `${node.tagName}0`

          node.children.push({
            type: "text",
            value: `{${tagName}}`,
            attributes: {[tagName]: node.properties}
          })
        }
      });

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
