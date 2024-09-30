import {visitParents} from "unist-util-visit-parents";
import {Attacher, Transformer, unified} from "unified";
import gfm from "remark-gfm";
import parse from "remark-parse";
import remark2rehype, {all} from "remark-rehype";
import rehype2remark, {all as toMdastAll} from "rehype-remark";
import stringify from "remark-stringify";
import raw, {Options} from "rehype-raw";
import remarkFrontmatter from "remark-frontmatter";
import {Element, ElementContent, Root as HastRoot} from "hast";
import {
  Context,
  Document,
  IdGenerator,
  LayoutElement,
  LayoutRoot,
  Processor,
  Segment,
  TagAttributes,
  Tags
} from "@localizesh/sdk";
import {SegmentsMap} from "./types"
import {MdastRoot} from "rehype-remark/lib";
import type {Info, State} from 'mdast-util-to-markdown/lib/types.js'
import {removePosition} from "unist-util-remove-position";
import img from "./handlers/hast-to-mdast/img.js";
import * as cheerio from 'cheerio';
import {
  divHastToMdast,
  headerHastToMdast,
  linkHastToMdast,
  listToMdast,
  ListTypes,
  tableHastToMdast
} from "./handlers/hast-to-mdast/handlers.js";
import {headingMdastToMd} from "./handlers/mdast-to-md/handlers.js";
import {toHtml} from "hast-util-to-html";
import {segmentParentNodeToHast} from "./handlers/mdast-to-hast/handlers.js";
import {hastToString} from "./utils/hast.js";
import {AVOID_HTML_TAGS, AVOID_HTML_TYPE, PlaceholderContent, replaceHtmlBeforeMdast} from "./utils/html.js";
import {Parent} from "mdast";
import YamlProcessor from "@localizesh/processor-yaml";
import {deleteFields as deletePositionFields} from "./utils/deleteFields.js";

const allowedTagsRegex: RegExp = /^\/?[a-zA-Z]+\d+$/;

const convertMdastTagToHast = (node: any) => {
  const tag = node.type
  const tagsMap: Record<string, string> = {
    link: "a",
    inlineCode: "code",
    emphasis: "em",
    image: "img",
    linkReference: "a",
    mdxJsxTextElement: node.name,
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
      const transformedInnerObject: TagAttributes = {};
      const tagsMap = key.includes("img")
          ? tagsMapImg
          : tagsMapLinks;

      for (const innerKey in innerObject) {
        if (innerObject.hasOwnProperty(innerKey)) {
          let tagAttributeValue = innerObject[innerKey]

          const tagAttributeValueIsObject: boolean = typeof tagAttributeValue === "object";
          if(tagAttributeValueIsObject) {
            deletePositionFields(tagAttributeValue)
            tagAttributeValue = JSON.stringify(tagAttributeValue)
          }
          if (tagsMap.hasOwnProperty(innerKey)) {
            transformedInnerObject[tagsMap[innerKey]] = tagAttributeValue;
          } else {
            transformedInnerObject[innerKey] = tagAttributeValue;
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

    const tag = convertMdastTagToHast(node);
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
    const tagTypeList = ['url', 'title', 'alt', 'marker', 'identifier', "data"];
    const attr: any = {};

    tagTypeList.forEach(tagType => {
      if (child[tagType]) {
        attr[tagType] = child[tagType];
      }
    });

    if (Object.keys(attr).length > 0) {
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
              ? {tags: JSON.stringify(tags, (key, value) => typeof value === "bigint" ? value.toString() : value)}
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

      const headingTagRegExp: RegExp = /^(\/)?h(\d)*$/;
      const tag: string = headingTagRegExp.test(tagWithIndex)
          ? tagWithIndex.replace(/\d(?!.*\d)/, "")
          : tagWithIndex.replace(/\d/g, "");

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
          const tagAttributes: TagAttributes = segment.tags[tagWithIndex];
          for (const tagAttrKey in tagAttributes) {
            const tagAttr = tagAttributes[tagAttrKey]
            const isStringifiedObject: boolean =
              (typeof tagAttr === "string" && tagAttr?.charAt(0) === "{" && tagAttr?.charAt(tagAttr.length - 1) === "}") ||
              (typeof tagAttr === "string" && tagAttr?.charAt(0) === "[" && tagAttr?.charAt(tagAttr.length - 1) === "]");

            if(isStringifiedObject) {
              tagAttributes[tagAttrKey] = JSON.parse(tagAttr)
            }
          }
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
  const allowHtmlTags = ["summary"]
  const transformer: Transformer = (ast, _) => {
    visitParents(
        ast,
        (node: any) => node.type === "element" && !node?.properties?.marker && node.position,
        (node: any, parent) => {

          const {start, end} = node.position;
          const text: string = doc.slice(start.offset, end.offset);
          const isHtml: boolean =
              text.indexOf(`<${node.tagName}>`) !== -1 || text.indexOf(`<${node.tagName} `) !== -1 || allowHtmlTags.includes(node.tagName);

          if (isHtml) {
            node.properties = {
              ...node.properties,
              marker: "html"
            }
          }

          if(node.tagName === "pre") {
            const childrenContentLength: number = getChildrenContentLength(node);
            if(childrenContentLength > 1) {
              const preBlock = toHtml(node.children);
              node.children = [
                {type: "text", value: "\n" + preBlock}
              ];
            }
          }

        }
    );
  };
  return transformer;
};

const getChildrenContentLength = (node: LayoutElement): number => {
  return node.children.reduce((acc: number, child: any) => {
    if (child.type === "element" || child?.value?.trim()) acc += 1;
    return acc;
  }, 0);
}

const replaceMdxPlaceholders = (text: string, placeholdersObj: any) => {
  const placeholderRegex = /MDX_PLACEHOLDER_\d+/g;
  const replacePlaceholder = (match: string): any => {
    if (placeholdersObj.hasOwnProperty(match)) {
      return placeholdersObj[match];
    } else {
      return match;
    }
  };

  return text.replace(placeholderRegex, replacePlaceholder);
};


const prepareMdast: Attacher = (option: {contentsAvoidMarkdown: PlaceholderContent[], placeholdersObj: {key: string, value: string}}) => {
  const { contentsAvoidMarkdown, placeholdersObj } = option;
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
                const isNotCodeNode = !["code", "inlineCode"].includes(node.type);
                if (AVOID_HTML_TAGS.includes(placeholder.tagName) && isNotCodeNode) {
                  node.type = AVOID_HTML_TYPE;
                }
              })

            }
          }

          if(node.type === "code") {
            node.value = replaceMdxPlaceholders(node.value, placeholdersObj)
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
            visitParents(
                node,
                (child) => "properties" in child && node !== child,
                (child: any, _) => {
                  if (child.tagName === "li") {
                    const newChildren: ElementContent[] = [];

                    child.children.map((textChild: Element) => {
                      if ("tagName" in textChild && textChild.tagName === "p") {
                        newChildren.push(...textChild.children);
                      } else {
                        newChildren.push(textChild);
                      }
                    })
                    delete child?.properties?.marker
                    child.children = [...newChildren];
                  }
                }
            );
            if(node.tagName !== "li") node.type = "html";
          }
          if(node.type === AVOID_HTML_TYPE) node.type = "html";
        }
    );
  };
  return transformer;
};

const replaceMdxComponents = (str: string) => {
  let counter = 0;
  const reactComponentRegex = /<([A-Z][a-z0-9]+)\b[^>]*>[\s\S]*?(?:(?!<\1>).)*<\/\1>/gs;
  const placeholdersObj: any = {};

  const replaceRecursive = (text: string) => {
    let replacedText = text;
    let match;

    while ((match = reactComponentRegex.exec(text)) !== null) {
      counter++;
      const [fullMatch, componentName] = match;
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;
      const placeholder = `    MDX_PLACEHOLDER_${counter}`;
      const replacedContent = fullMatch;
      const before = replacedText.slice(0, startIndex);
      const after = replacedText.slice(endIndex);
      replacedText = before + placeholder + after;
      placeholdersObj[placeholder.trim()] = replacedContent;
      text = before + placeholder + after;
      reactComponentRegex.lastIndex = startIndex;
    }

    return replacedText;
  };

  const docWithMDXPlaceholders = replaceRecursive(str);
  return { docWithMDXPlaceholders, placeholdersObj };
};
class MdProcessor implements Processor {
  private yamlProcessor: YamlProcessor;
  private mdastToHastHandlers: Record<string, Function> = {};
  private hastToMdastHandlers: Record<string, Function> = {};
  private passThroughTypes: string[] = ["yaml", "definition", AVOID_HTML_TYPE];
  protected mdast: any = {};

  constructor() {
    this.yamlProcessor = new YamlProcessor()
  }

  protected getMdastToStringHandlers(): Record<string, Function> {
    let listBulletLastUsed: string[] = []

    return {
      text: (node: any) => node.value,
      code: (node: any, _: Parent | undefined, state: State, info: Info) => {
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
      emphasis: (node: any, _: Parent | undefined, state: State, info: Info) => {
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
      link: (node: any, _: Parent | undefined, state: State, info: Info) => {
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
      inlineCode: (node: any, _: Parent | undefined, state: State, info: Info) => {
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
      strong: (node: any, _: Parent | undefined, state: State, info: Info) => {
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
      list: (node: any, _: Parent | undefined, state: State, info: Info) => {
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
      thematicBreak: (node: any) => {
        let marker: string = node?.properties.marker;
        return marker ? marker : "---";
      },
      blockquote: (node: any, _: Parent | undefined, state: State, info: Info) => {
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
      heading: (node: any, _: Parent | undefined, state: State, info: Info) => headingMdastToMd(node, state, info)
    }
  }

  protected mdParagraphHandler(state: any, node: any, mdast: MdastRoot) {
    const segment: any = convertMdastNodeToText(node, mdast);
    const tagName: string = node.depth ? "h" + node.depth : "p";
    return segmentParentNodeToHast(state, node, segment, tagName);
  }

  protected addMdastToHastHandler(handlers: Record<string, Function>) {
    this.mdastToHastHandlers = { ...this.mdastToHastHandlers, ...handlers };
  }

  protected addHastToMdastHandler(handlers: Record<string, Function>) {
    this.hastToMdastHandlers = { ...this.hastToMdastHandlers, ...handlers };
  }

  protected addPassThroughTypes(passThroughTypes: string[]) {
    this.passThroughTypes = this.passThroughTypes.concat(passThroughTypes);
  }

  protected parseMarkdownToMdast(doc: string): { mdast: MdastRoot, newDoc: string } {
    const mdast: MdastRoot = unified()
        .use(parse)
        .use(remarkFrontmatter, ["yaml"])
        .use(gfm)
        .parse(doc);
    return { mdast: mdast, newDoc: doc };
  }

  protected parseMdastToMarkdown(mdast: MdastRoot): string {
    return unified()
        .use(gfm)
        .use(stringify, {
          handlers: this.getMdastToStringHandlers(),
        })
        .stringify(mdast) as string;
  }

  public parse(doc: string, ctx?: Context): Document {
    const { docWithHtmlPlaceholders, contentsAvoidMarkdown } =
        replaceHtmlBeforeMdast(doc);

    const { docWithMDXPlaceholders, placeholdersObj } = replaceMdxComponents(docWithHtmlPlaceholders)

    const { mdast, newDoc } = this.parseMarkdownToMdast(docWithMDXPlaceholders);
    this.mdast = mdast;

    const hast = unified()
        .use(keepMarkerPlugin, { doc: newDoc })
        .use(prepareMdast, { contentsAvoidMarkdown, placeholdersObj })
        .use(remark2rehype, {
          passThrough: ["definition", AVOID_HTML_TYPE],
          allowDangerousHtml: true,
          handlers: {
            paragraph: (state, node) => {
              return this.mdParagraphHandler(state, node, mdast);
            },
            code: (state, node) => {
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
            heading: (state, node) => {
              return this.mdParagraphHandler(state, node, mdast);
            },
            tableRow: (state, node, parent) => {
              const cells: any[] = [];
              const isTableHeadOnGfmTable: boolean =
                  parent ? parent.children.reduce((acc, tableRow, index) => {
                    if (index === 0 && tableRow === node) acc = true;
                    return acc;
                  }, false) : false;

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
                if(isTableHeadOnGfmTable) cell.tagName = "th";
                cells.push(cell);
              });

              return {
                type: "element",
                tagName: isTableHeadOnGfmTable ? "thead" : "tr",
                properties: {},
                children: cells,
              };
            },
            yaml: (state, node) => node,
            footnoteReference: (state, node) => {
              return { type: "text", value: `[^${node.label}]` };
            },
            footnoteDefinition: (state, node) => {
              const paragraphLevel = node.children[0];
              const paragraphLevelChildrenInHast: any[] = all(state, paragraphLevel);
              const footnoteLabel = `[^${node.label}]: `;
              const children = [
                { type: "text", value: footnoteLabel },
                ...paragraphLevelChildrenInHast,
              ];
              return {
                type: "element",
                tagName: "p",
                children,
                properties: {marker: "footnoteDefinition"},
              };
            },
            listItem: (state, node) => {
              let listItemChildren = all(state, node);
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
            list: (state, node) => {
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
                children: all(state, node),
              };
            },
            table: (state, node) => {
              const properties: any = { align: JSON.stringify(node.align) };
              if (node.marker) properties.marker = node.marker;
              return {
                type: "element",
                tagName: "table",
                properties,
                children: all(state, node),
              };
            },
            thematicBreak: (state, node) => {
              return {
                properties: { ...node.properties, marker: node.marker || "" },
                type: "element",
                tagName: "hr",
                children: [],
              };
            },
            definition: (state, node) => node,
            ...this.mdastToHastHandlers
          },
        })
        .use(raw, { passThrough: this.passThroughTypes } as unknown as Options)
        .use(postProcessHtmlMarker, { doc: docWithHtmlPlaceholders })
        .runSync(mdast) as HastRoot;

    const { layout, segments } = this.hastToSegments(hast,ctx);

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
            html: (h, node) => {
              node?.properties?.marker === "html" && delete node?.properties?.marker;

              const isAvoidHtmlType: string | undefined = node.value;
              if(isAvoidHtmlType) {
                return {
                  type: "paragraph",
                  children: [{type: "text", value: node.value}],
                }
              }
              const isTableOrList: boolean = ["table", "ul", "ol", "div"].includes(node.tagName);

              if(isTableOrList) {
                visitParents(node, (node) => node.type === "html", (child, _) => {
                  child.type = "element";
                  delete child?.properties?.marker;
                })
              }
              const outerHtml: string = toHtml(
                  {
                    ...node, type: "element",
                    children: isTableOrList ? node.children : []
                  },
                  { allowDangerousCharacters: true, allowDangerousHtml: true }
              );

              if (isTableOrList) {
                return {
                  type: "paragraph",
                  children: [{type: "text", value: outerHtml}],
                };
              }

              const index: number = outerHtml.indexOf("></");
              const innerNodes = toMdastAll(h, node);
              const htmlLevel: any = {
                properties: node.properties,
                type: "paragraph",
                children: [
                  {type: "text", value: outerHtml.slice(0, index + 1)},
                  ...innerNodes,
                  {type: "text", value: outerHtml.slice(index + 1)}
                ],
              };
              return htmlLevel;
            },
            pre: (h, node) => {
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
            code: (h, node) => {
              const inlineCode: any = {
                properties: node.properties,
                type: "inlineCode",
                children: toMdastAll(h, node),
              };
              return inlineCode;
            },
            img: (h, node, parent) => img(node, parent),
            yaml: (h, node) => {
              const yamlStr = this.yamlProcessor.stringify(data)

              return {
                type: "paragraph",
                position: undefined,
                children: [
                  {
                    type: "text",
                    value: `---\n${yamlStr}---`,
                  },
                ],
              };
            },
            em: (h, node) => {
              let emphasis: any = {
                properties: node.properties,
                type: "emphasis",
                children: toMdastAll(h, node),
              };
              return emphasis;
            },
            strong: (h, node) => {
              let strong: any = {
                properties: node.properties,
                type: "strong",
                children: toMdastAll(h, node),
              };
              return strong;
            },
            ol: (h, node) => listToMdast(h, node, ListTypes.ol),
            ul: (h, node) => listToMdast(h, node, ListTypes.ul),
            a: (h, node) => linkHastToMdast(h, node, hast),
            table: (h, node) => tableHastToMdast(h, node),
            div: (h, node) => divHastToMdast(h, node),
            hr: (h, node) => {
              return { type: "thematicBreak", properties: node.properties };
            },
            definition: (h, node) => node,
            h2: (h, node) => headerHastToMdast(h, node),
            h1: (h, node) => headerHastToMdast(h, node),
            ...this.hastToMdastHandlers
          },
        })
        .runSync(hast) as MdastRoot;

    return this.parseMdastToMarkdown(mdast)
  }

  protected getElementFromConvertHastToSegment(node: LayoutElement, isNodeList: boolean, convertNode: any): any {
    if (node.type === "element") {
      const children: LayoutElement[] = node.children.map((child: any) => {
        if (node.properties?.marker === "html" && isNodeList) {
          "properties" in child && (child.properties.marker = "html");
        }

        return convertNode(child);
      });

      return {
        ...node,
        children: children,
      };
    }

    return null
  }

  private hastToSegments(tree: HastRoot, ctx: Context): Document {
    const idGenerator = new IdGenerator();
    let segments: Segment[] = [];
    const layout: LayoutRoot = { type: "root", children: [] };

    const addSegment = (node: any): string => {
      const tags = node.tags;
      const id: string = idGenerator.generateId(node.value as string, tags, ctx)
      const segment: Segment = {
        id,
        text: node.value || "",
        ...(tags && { tags }),
      };

      segments.push(segment);
      return segment.id;
    };

    const checkIsList = (node: LayoutElement): boolean => {
      return "tagName" in node && (node.tagName === ListTypes.ul || node.tagName === ListTypes.ol);
    };

    const convertNode = (node: any) => {
      if (node.type === "text") {
        if (node.value?.trim() === "") {
          return node;
        } else {
          return { type: "segment", id: addSegment(node) };
        }
      }

      const isHtmlNode: boolean = node.type === "element" && node.properties?.marker === "html";
      if (isHtmlNode && "tagName" in node) {
        if (node.tagName === "li") {
          const listChild: LayoutElement | undefined = node.children.find(checkIsList);

          if (listChild) {
            const childrenLength: number = node.children.length - 1;

            node.children = node.children.filter((child: LayoutElement, index: number) => {
              if (!checkIsList(child) && index !== childrenLength) {
                return child;
              }
            });
          }

          const {text, tags} = hastToString(node);

          const resultNode: Element = {
            ...node,
            children: [
              {
                type: "element",
                tagName: "p",
                properties: {},
                children: [
                  {type: "segment", id: addSegment({...node, value: text, tags})}
                ],
              }
            ]
          };

          if (listChild) {
            "properties" in listChild && (listChild.properties.marker = "html");

            resultNode.children.push(convertNode(listChild));
          }

          return resultNode;
        }

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
      }

      const isFootnoteDefinition: boolean = node.type === "element" && node?.properties?.marker === "footnoteDefinition";
      if(isFootnoteDefinition) {
        const {text, tags} = hastToString(node, {rootContext: {index: isFootnoteDefinition ? 0 : -1}});
        if ("children" in node) {
          return {
            ...node,
            children: [
              {type: "segment", id: addSegment({...node, value: text, tags})}
            ]
          }
        }
      }

      const isNodeList: boolean = checkIsList(node);

      const nodeElement = this.getElementFromConvertHastToSegment(node, isNodeList, convertNode)

      if(nodeElement) return nodeElement

      if (node.type === "comment" || node.type === "definition" || node.type === AVOID_HTML_TYPE) return node;

      if(node.type === "yaml" && node.value) {
        const yamlDoc = this.yamlProcessor.parse(node.value)

        segments = segments.concat(yamlDoc.segments)

        return yamlDoc.layout.children[0]
      }

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

        const childrenContentLength: number = getChildrenContentLength(node);

        const hasNodeImgOrLink: boolean = node.children.findIndex((child: LayoutElement): boolean =>
            'tagName' in child && (child?.tagName === "a" || child?.tagName === "img")) >= 0;

        if (node.tagName === "td" || node.tagName === "th" || hasNodeImgOrLink) {
          if (
              (childrenContentLength > 1 && node.children.some((el: any) => el.type === "element")) ||
              hasNodeImgOrLink
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

  segmentsToHast(data: Document): any {
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

    return data.layout;
  }
}

export default MdProcessor;
