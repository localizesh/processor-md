import { visitParents } from "unist-util-visit-parents";
import { unified, Transformer, Attacher } from "unified";
import gfm from "remark-gfm";
import parse from "remark-parse";
import remark2rehype, { all } from "remark-rehype";
import rehype2remark, { all as toMdastAll } from "rehype-remark";
import stringify from "remark-stringify";
import raw, {Options} from "rehype-raw";
import remarkFrontmatter from "remark-frontmatter";
import { Element, Root as HastRoot } from "hast";
import {
  Tags,
  Document,
  Layout,
  LayoutElement,
  LayoutNode,
  Processor,
  Segment,
  Context,
  AvoidHtmlNode,
  IdGenerator
} from "@localizeio/lib";
import { SegmentsMap } from "./types"
import { MdastRoot } from "rehype-remark/lib";
import { removePosition } from "unist-util-remove-position";
import img from "./handlers/hast-to-mdast/img.js";
import yaml from "./handlers/yaml-to-hast/yaml.js";
import cheerio from "cheerio";
import {
  listToMdast,
  ListTypes,
  linkHastToMdast,
  tableHastToMdast,
  divHastToMdast,
  headerHastToMdast
} from "./handlers/hast-to-mdast/handlers.js";
import {headingMdastToMd} from "./handlers/mdast-to-md/handlers.js";
import { toHtml } from "hast-util-to-html";
import { segmentParentNodeToHast } from "./handlers/mdast-to-hast/handlers.js";
import { hastToString } from "./utils/hast.js";
import {AVOID_HTML_TAGS, AVOID_HTML_TYPE, PlaceholderContent, replaceHtmlBeforeMdast} from "./utils/html.js";

const replacedStrings: string[] = [];
const allowedTagsRegex: RegExp = /^\/?[a-zA-Z]+\d+$/;
let replacementIndex = 0;

const convertMdastTagToHast = (tag: string) => {
  const tagsMap: Record<string, string> = {
    link: "a",
    inlineCode: "code",
    emphasis: "em",
    image: "img",
    linkReference: "a",
    delete: "del"
  };

  return tagsMap[tag] ? tagsMap[tag] : tag;
};

const convertMdastTagsToHast = (tags: any) => {
  let newTags: Tags = {};
  const tagsMapLinks: Record<string, string> = {
    url: "href",
  };
  const tagsMapImg: Record<string, string> = {
    url: "src",
  };

  for (const key in tags) {
    if (tags.hasOwnProperty(key)) {
      const innerObject = tags[key];
      const transformedInnerObject: any = {};
      const tagsMap = key.includes("img")
        ? tagsMapImg
        : tagsMapLinks;

      for (const innerKey in innerObject) {
        if (innerObject.hasOwnProperty(innerKey)) {
          if (tagsMap.hasOwnProperty(innerKey)) {
            transformedInnerObject[tagsMap[innerKey]] =
              innerObject[innerKey];
          } else {
            transformedInnerObject[innerKey] = innerObject[innerKey];
          }
        }
      }

      newTags[key] = transformedInnerObject;
    }
  }

  return newTags;
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
  let tags: Tags = {};
  const htmlTags: number[] = [];

  const nodeToString = (node: any): string => {
    if (node.type === "linkReference" && mdast) {
      visitParents(
        mdast,
        (mdastChild) =>
          mdastChild.type === "definition" &&
          "identifier" in mdastChild &&
          mdastChild.identifier === node.identifier,
        (definition: any, _) => {
          node.url = definition.url;
        }
      );
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
        tags[tagName + tagCountTemp] = { ...htmlAttributes };
        if (node.marker)
          tags[tagName + tagCountTemp].marker = node.marker;
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
      setTags(node, tagNameWithIndex);
      tagCount++;

      const content = node.children.map(nodeToString).join("");

      return `{${tag}${tagCountTemp}}${content}{/${tag}${tagCountTemp}}`;
    } else if ("value" in node || node.type === "image") {
      if (tag !== "text") {
        let value: string;
        tagNameWithIndex = tag + tagCount;

        setTags(node, tagNameWithIndex);

        if (node.type === "image") {
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

  const setTags = (child: any, tag: string): void => {
    if (
      child.url ||
      child.title ||
      child.alt ||
      child.marker ||
      child.identifier
    ) {
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

      tags[tag] = { ...tags[tag], ...attr };
    }
  };

  resultNodeText = node.children.map(nodeToString).join("");

  if (resultNodeText) {
    return {
      type: "text",
      value: resultNodeText,
      tags:
        Object.keys(tags).length > 0
          ? { tags: JSON.stringify(tags) }
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
        if (segment.tags) {
          properties = segment.tags[tagWithIndex];
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
  const { doc } = option;
  const transformer: Transformer = (ast, _) => {
    visitParents(
      ast,
      (node) =>
        [
          "emphasis",
          "code",
          "inlineCode",
          "strong",
          "list",
          "image",
          "link",
          "table",
          "html",
          "thematicBreak",
          "heading"
        ].includes(node.type),
      (node: any, parent) => {

        let marker: string = doc.charAt(node.position?.start?.offset);
        switch (node.type) {
          case "strong": {
            marker += marker;
            break;
          }
          case "list": {
            marker += doc.charAt(node.position?.start?.offset + 1).trim();
            if (marker.length > 1) marker = marker[marker.length - 1];
            break;
          }
          case "html": {
            marker = "html";
            break;
          }
          case "heading": {
            if(marker !== "#") {
              marker = doc.charAt(node.position?.end?.offset - 1).trim();
            }
            break;
          }
          case "thematicBreak": {
              marker = doc.substring(node.position?.start?.offset, node.position?.end?.offset);
            break;
          }
        }

        node.marker = marker;
      }
    );
  };
  return transformer;
};

const postProcessHtmlMarker: Attacher = (option: {doc: string}) => {
  const {doc} = option;
  const transformer: Transformer = (ast, _) => {
    visitParents(
      ast,
      (node: any) => node.type === "element" && !node?.properties?.marker && node.position,
      (node: any, parent) => {

        const {start, end} = node.position;
        const text: string = doc.slice(start.offset, end.offset);
        const isHtml: boolean =
          text.indexOf(`<${node.tagName}>`) !== -1 || text.indexOf(`<${node.tagName} `) !== -1;

        if (isHtml) {
          node.properties = {
            ...node.properties,
            marker: "html"
          }
        }
      }
    );
  };
  return transformer;
};

const prepareMdast: Attacher = (option: {contentsAvoidMarkdown: PlaceholderContent[]}) => {
  const { contentsAvoidMarkdown } = option;
  const contentsAvoidMarkdownCopy: PlaceholderContent[] = [...contentsAvoidMarkdown];

  const transformer: Transformer = (ast, _) => {
    visitParents(
      ast,
      (node) => ["link", "yaml", "text", "html", "code", "inlineCode"].includes(node.type),
      (node: any, parent) => {
        if (node.type === "link") {
          const isLinkUrlLAndLinkTextHasSameValue: boolean =
            node.url === node?.children[0]?.value &&
            node.type === "link" &&
            node.marker === "h";

          const isEmail: boolean = (node.title === null && node.url.includes("mailto:"));

          if (isLinkUrlLAndLinkTextHasSameValue || isEmail) {
            node.type = "text";
            node.value = node?.children[0].value;
            delete node.children;
          }
        }

        if(node.type === "yaml"){
          if (contentsAvoidMarkdown.length) {
            contentsAvoidMarkdown.forEach((placeholder: PlaceholderContent)=> {
              node.value = node.value.replace(placeholder.placeholder, placeholder.content)
            })
          }
        }

        if (contentsAvoidMarkdownCopy.length && node.type !== "yaml" && "value" in node) {

          const htmlPlaceholders: PlaceholderContent[] = contentsAvoidMarkdownCopy.reduceRight(
            (acc: PlaceholderContent[], curr: PlaceholderContent, i: number, arr: PlaceholderContent[]) => {
              if (node.value.includes(curr.placeholderWithoutTags)) {
                acc.push(curr);
                arr.splice(i, 1);
              }
              return acc;
            }, []);

          if (htmlPlaceholders.length) {
            htmlPlaceholders.forEach((placeholder: PlaceholderContent) => {
              node.value = node.value.replace(placeholder.placeholderWithoutTags, placeholder.contentWithoutTags);

              if (AVOID_HTML_TAGS.includes(placeholder.tagName)) {
                node.type = AVOID_HTML_TYPE;
              }
            })

          }
        }

      }
    );
  };
  return transformer;
};

const convertToHtmlType: Attacher = () => {
  const transformer: Transformer = (ast, _) => {
    visitParents(
      ast,
      (node) => "properties" in node || node.type === AVOID_HTML_TYPE,
      (node: any, parent) => {

        if (node?.properties?.marker === "html") {
          let properties = { ...node.properties };
          delete properties.marker;
          visitParents(
            node,
            (child) => "properties" in child && node !== child,
            (child: any, _) => delete child?.properties?.marker
          );
          const value: string = toHtml(
            { ...node, properties },
            { allowDangerousCharacters: true, allowDangerousHtml: true }
          );
          node.type = "html";
          node.value = value;
        }
        if(node.type === AVOID_HTML_TYPE) node.type = "html";
      }
    );
  };
  return transformer;
};

class MdProcessor implements Processor {
  public parse(doc: string, ctx?: Context): Document {

    const { docWithHtmlPlaceholders, contentsAvoidMarkdown } =
      replaceHtmlBeforeMdast(doc);

    const mdast = unified()
      .use(parse)
      .use(remarkFrontmatter, ["yaml"])
      .use(gfm)
      .parse(docWithHtmlPlaceholders);

    const hast = unified()
      .use(keepMarkerPlugin, { doc: docWithHtmlPlaceholders })
      .use(prepareMdast, { contentsAvoidMarkdown })
      .use(remark2rehype, {
        passThrough: ["definition", AVOID_HTML_TYPE],
        allowDangerousHtml: true,
        handlers: {
          code: (h, node, parent) => {
            const properties: any = {};
            if (node.lang) properties.lang = node.lang;
            if (node.meta) properties.meta = node.meta;

            let codeElement: any = {
              properties,
              type: "element",
              tagName: "code",
              children: [{ type: "text", value: node.value }],
            };
            if (node.marker) properties.marker = node.marker;

            return {
              type: "element",
              tagName: "pre",
              properties: {},
              children: [codeElement],
            };
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
            const cells: any[] = [];
            visitParents(node, { type: "tableCell" }, (child) => {
              const segment: any = convertMdastNodeToText(child);
              let cell: any;

              if (segment !== null && segment.type !== "text") {
                cell = state.one(segment, parent);
                cell.children[0].properties.marker = segment.children[0].marker;
              } else {
                cell = state.one(child, parent);
                cell.properties = segment?.tags || {};
                cell.children = segment ? [segment] : [];
              }

              cells.push(cell);
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
              tagName:
                typeof node.start === "number" ? ListTypes.ol : ListTypes.ul,
              properties,
              children: all(h, node),
            };
          },
          table: (h, node, parent) => {
            const properties: any = { align: node.align };
            if (node.marker) properties.marker = node.marker;
            return {
              type: "element",
              tagName: "table",
              properties,
              children: all(h, node),
            };
          },
          thematicBreak: (h, node, parent) => {
            return {
              properties: { ...node.properties, marker: node.marker || "" },
              type: "element",
              tagName: "hr",
              children: [],
            };
          },
          definition: (h, node, parent) => node,
        },
      })
      .use(raw, { passThrough: ["yaml", "definition", AVOID_HTML_TYPE] } as unknown as Options)
      .use(postProcessHtmlMarker, { doc: docWithHtmlPlaceholders })
      .runSync(mdast) as HastRoot;

    const { layout, segments } = this.hastToSegments(hast, ctx);

    removePosition(layout);

    return { layout: layout, segments };
  }

  public stringify(data: Document, ctx?: Context): string {
    const hast = this.segmentsToHast(data);

    const mdast: MdastRoot = unified()
      .use(convertToHtmlType)
      .use(rehype2remark, {
        newlines: true,
        handlers: {
          html: (h, node, parent) => {
            return {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  value: node.value
                }
              ]
            }
          },
          pre: (h, node, parent) => {
            const isPreCodeWrapper =
              node.children.length === 1 && node.children[0].tagName === "code";
            if (isPreCodeWrapper) {
              const codeNode = node.children[0];
              return {
                type: "code",
                value: codeNode.children[0].value,
                meta: codeNode.properties.meta,
                lang: codeNode.properties.lang || "no_lang",
                marker: codeNode.properties?.marker,
              };
            } else {
              const htmlValue = toHtml(node, {
                allowDangerousCharacters: true,
                allowDangerousHtml: true,
              });
              return {
                properties: node.properties,
                type: "html",
                value: htmlValue,
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
          hr: (h, node, parent) => {
            return { type: "thematicBreak", properties: node.properties };
          },
          definition: (h, node, parent) => node,
          h2: (h, node) => headerHastToMdast(h, node),
          h1: (h, node) => headerHastToMdast(h, node),
        },
      })
      .runSync(hast) as MdastRoot;

    let listBulletLastUsed: string[] = []

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
              children: [{ type: "text", value: node.value }],
            };

            if (!marker) {
              const strCode = unified().use(stringify).stringify(codeIndented);
              return strCode.trimRight();
            }
            const exit = state.enter("codeIndented");
            const lineBreak = marker ? "\n" : "";
            const tracker = state.createTracker(info);

            let value = tracker.move(
              marker +
                (node.lang === "no_lang" ? "" : node.lang) +
                (marker ? " " : "") +
                (node.meta ? node.meta : "") +
                lineBreak
            );
            value += state.containerPhrasing(codeIndented, {
              before: value,
              after: marker,
              ...tracker.current(),
            });
            value += tracker.move(lineBreak + marker);

            exit();
            return value;
          },
          emphasis: (node, _, state, info) => {
            const marker =
              node.properties?.marker || state.options.emphasis || "<em>";

            const exit = state.enter("emphasis");
            const tracker = state.createTracker(info);
            let value = tracker.move(marker);
            value += tracker.move(
              state.containerPhrasing(node, {
                before: value,
                after: marker,
                ...tracker.current(),
              })
            );
            value += tracker.move(marker === "<em>" ? "</em>" : marker);
            exit();
            return value;
          },
          link: (node, _, state, info) => {
            const exit = state.enter("link");
            const tracker = state.createTracker(info);
            let value = tracker.move("[");
            value += tracker.move(
              state.containerPhrasing(node, {
                before: value,
                after: "]",
                ...tracker.current(),
              })
            );
            value += tracker.move("](" + node.url + ")");
            exit();
            return value;
          },
          inlineCode: (node, _, state, info) => {
            const marker = node.properties?.marker || "<code>";

            const exit = state.enter("blockquote");
            const tracker = state.createTracker(info);
            let value = tracker.move(marker);
            value += tracker.move(
              state.containerPhrasing(node, {
                before: value,
                after: marker,
                ...tracker.current(),
              })
            );
            value += tracker.move(marker === "<code>" ? "</code>" : marker);
            exit();
            return value;
          },
          strong: (node, _, state, info) => {
            let marker = node.properties?.marker || "<strong>";

            const exit = state.enter("strong");
            const tracker = state.createTracker(info);
            let value = tracker.move(marker);
            value += tracker.move(
              state
                .containerPhrasing(node, {
                  before: value,
                  after: marker,
                  ...tracker.current(),
                })
                ?.trimRight()
            );
            value += tracker.move(marker === "<strong>" ? "</strong>" : marker);
            exit();
            return value;
          },
          list: (node, _, state, info) => {
            const marker = node.properties?.marker || node.marker;
            const exit = state.enter("list");
            const tracker = state.createTracker(info);

            state.bulletCurrent = marker;
            listBulletLastUsed.push(marker)
            state.options.listItemIndent = "one";

            let value = tracker.move(
              state.containerFlow(node, {
                ...info,
              })
            );

            listBulletLastUsed.pop()
            state.bulletCurrent = listBulletLastUsed[listBulletLastUsed.length - 1]
            exit();
            return value;
          },
          thematicBreak: (node) => {
            let marker: string = node?.properties.marker;
            return marker ? marker : "---";
          },
          blockquote: (node, _, state, info) => {
            function map(line: string, _: number, blank: boolean): string {
              const row: string = (blank ? '' : ' ') + line

              return (line || _ > 0) ? '>' + row : row;
            }

            const exit = state.enter('blockquote')
            const tracker = state.createTracker(info)
            tracker.move('> ')
            tracker.shift(2)
            const value = state.indentLines(
              state.containerFlow(node, tracker.current()),
              map
            )
            exit()
            return value
          },
          heading: (node, _, state, info) => headingMdastToMd(node, state, info)
        },
      })
      .stringify(mdast) as string;
  }

  private hastToSegments(tree: HastRoot, ctx: Context): Document {
    const idGenerator = new IdGenerator(ctx);
    const segments: Segment[] = [];
    const layout: Layout = { type: "root", children: [] };

    const addSegment = (node: LayoutElement): string => {
      const tags = node.tags;
      const id: string = idGenerator.generateId(node.value, tags)
      const segment: Segment = {
        id,
        text: node.value || "",
        ...(tags && { tags }),
      };

      segments.push(segment);
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

      const isHtmlNode: boolean = node.type === "element" && node.properties?.marker === "html";
      if (isHtmlNode && "tagName" in node) {
        if (node.tagName === "a" || node.tagName === "img") {
          const {text, tags} = hastToString(node, {rootContext: {index: 0}});

          return {
            type: "element",
            tagName: "p",
            properties: {},
            children: [
              {type: "segment", id: addSegment({...node, value: text, tags})}
            ],
          }
        }

        const childHasImgOrLink: boolean = node.children.findIndex((child: LayoutNode): boolean =>
          'tagName' in child && (child?.tagName === "a" || child?.tagName === "img")) >= 0;

        if (childHasImgOrLink) {
          const {text, tags} = hastToString(node);

          return {
            ...node,
            children: [
              {type: "segment", id: addSegment({...node, value: text, tags: tags})}
            ],
          }
        }
      }

      const isNoConvertNode: boolean =
        "properties" in node && node.properties?.type === "yamlKey";

      if ((node.type === "element" || node.type === "yaml") && !isNoConvertNode) {
        const children = node.children.map(convertNode);

        return {
          ...node,
          children: children,
        };
      }

      if (node.type === "comment" || node.type === "definition" || node.type === AVOID_HTML_TYPE || isNoConvertNode) return node;

      throw new Error(`Unsupported node type: ${node.type}`);
    };

    tree.children.forEach((child: any) => {
      visitParents(child, { type: "element" }, (node: any) => {
        if (node.properties?.tags) {
          node.children[0].tags = convertMdastTagsToHast(
            JSON.parse(node.properties.tags)
          );

          delete node.properties.tags;
        }

        if (node.tagName === "td" || node.tagName === "th") {
          if (
            node.children.length > 1 &&
            node.children.some((el: any) => el.type === "element")
          ) {
            const { text, tags } = hastToString(node);

            if (text) {
              node.children = [{ type: "text", value: text, tags }];
            }
          }
        }

        if (
          (node.tagName === "img" || node.tagName === "a") &&
          node.children.length === 0
        ) {
          const tagName: string = `${node.tagName}0`;

          node.children.push({
            type: "text",
            value: `{${tagName}}`,
            tags: { [tagName]: node.properties },
          });
        }
      });

      layout.children.push(convertNode(child));
    });

    return { layout, segments };
  }

  private segmentsToHast(data: Document): any {
    const segmentsMap: SegmentsMap = {};

    data.segments.forEach((segment: Segment): void => {
      segmentsMap[segment.id] = segment;
    });

    visitParents(data.layout, { type: "segment" }, (node: any, parent) => {
      const structure: Element[] = parseStringToStructure(segmentsMap[node.id]);
      let parentTemp = parent[parent.length - 1];
      const indexElement = parentTemp.children.findIndex(
        (child: any): boolean => child.id === node.id
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
