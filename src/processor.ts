import { visitParents } from "unist-util-visit-parents";
import { unified } from "unified";
import gfm from "remark-gfm";
import parse from "remark-parse";
import remark2rehype from "remark-rehype";
import stringify from "remark-stringify";
import raw, { Options } from "rehype-raw";
import remarkFrontmatter from "remark-frontmatter";
import { toMdast } from "./utils/hast-to-mdast/index.js";
import {
  Element,
  ElementContent,
  Root as HastRoot,
  Text as HastText,
} from "hast";
import {
  Document,
  LayoutElement,
  LayoutRoot,
  Processor,
  Segment,
  Tag,
  root,
  element,
  segment,
} from "@localizesh/sdk";

import { SegmentsMap } from "./types";
import { Root as MdastRoot } from "mdast";
import type { Info, State } from "mdast-util-to-markdown/lib/types.js";
import { removePosition } from "unist-util-remove-position";
import img from "./handlers/hast-to-mdast/img.js";
import rehypeParse from "rehype-parse";
import {
  divHastToMdast,
  headerHastToMdast,
  linkHastToMdast,
  listToMdast,
  ListTypes,
  tableHastToMdast,
} from "./handlers/hast-to-mdast/handlers.js";
import {
  headingMdastToMd,
  breakHandler as mdastToMdBreakHandler,
} from "./handlers/mdast-to-md/handlers.js";
import { toHtml } from "hast-util-to-html";
import {
  breakHandler,
  segmentParentNodeToHast,
} from "./handlers/mdast-to-hast/handlers.js";
import { hastToString } from "./utils/hast.js";
import { toHtmlSafe } from "./utils/toHtmlSafe.js";
import {
  AVOID_HTML_TAGS,
  AVOID_HTML_TYPE,
  PlaceholderContent,
  replaceHtmlBeforeMdast,
} from "./utils/html.js";
import { Parent } from "mdast";
import YamlProcessor from "@localizesh/processor-yaml";
import { deleteFields as deletePositionFields } from "./utils/deleteFields.js";

const allowedTagsRegex: RegExp = /^\/?[a-zA-Z]+\d+$/;

const convertMdastTagToHast = (node: any) => {
  const tag = node.type;
  const tagsMap: Record<string, string> = {
    link: "a",
    inlineCode: "code",
    emphasis: "em",
    image: "img",
    linkReference: "a",
    mdxJsxTextElement: node.name,
    delete: "del",
    break: "br",
  };

  return tagsMap[tag] ? tagsMap[tag] : tag;
};

const convertMdastTagsToHast = (tags: any) => {
  let newTags: Record<string, Tag> = {};
  const tagsMapLinks: Record<string, string> = {
    url: "href",
  };
  const tagsMapImg: Record<string, string> = {
    url: "src",
  };

  for (const key in tags) {
    if (tags.hasOwnProperty(key)) {
      const innerObject = tags[key];
      const transformedInnerObject: Tag = {};
      const tagsMap = key.includes("img") ? tagsMapImg : tagsMapLinks;

      for (const innerKey in innerObject) {
        if (innerObject.hasOwnProperty(innerKey)) {
          let tagAttributeValue = innerObject[innerKey];

          const tagAttributeValueIsObject: boolean =
            typeof tagAttributeValue === "object";
          if (tagAttributeValueIsObject) {
            deletePositionFields(tagAttributeValue);
            tagAttributeValue = JSON.stringify(tagAttributeValue);
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
  if (!html || html.length < 2) return { tagName: "", htmlAttributes: {} };
  const isUpperCaseCapitalLetter = html[1] === html[1].toUpperCase();

  const tree = unified()
    .use(rehypeParse, { fragment: true })
    .parse(html);

  let tagName = "";
  let htmlAttributes = {};

  tree.children.forEach((node: any) => {
    if (node.type === "element") {
      tagName = node.tagName;
      if (isUpperCaseCapitalLetter) {
        tagName = tagName.charAt(0).toUpperCase() + tagName.slice(1);
      }

      const attributes: any = {};
      for (const [key, value] of Object.entries(node.properties || {})) {
        if (key === "className" && Array.isArray(value)) {
          attributes["class"] = value.join(" ");
        } else if (key === "htmlFor") {
          attributes["for"] = value;
        } else if (value === true) {
          attributes[key] = "";
        } else {
          attributes[key] = String(value);
        }
      }
      htmlAttributes = attributes;
    }
  });

  return { tagName, htmlAttributes };
}

function convertMdastNodeToText(node: any, mdast?: any) {
  let resultNodeText = "";
  let tagCount = 0;
  let tags: Record<string, Tag> = {};
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
        },
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
        if (node.marker) tags[tagName + tagCountTemp].marker = node.marker;
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
    } else if (node.type === "break") {
      setTags(node, `br${tagCount}`);
      return `{br${tagCount}}`;
    } else {
      return "";
    }
  };

  const setTags = (child: any, tag: string): void => {
    const tagTypeList = ["url", "title", "alt", "marker", "identifier", "data"];
    const attr: any = {};

    tagTypeList.forEach((tagType) => {
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
          ? {
              tags: JSON.stringify(tags, (key, value) =>
                typeof value === "bigint" ? value.toString() : value,
              ),
            }
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
          const tag: Tag = segment.tags[tagWithIndex];
          for (const tagAttrKey in tag) {
            const tagAttr = tag[tagAttrKey];
            const isStringifiedObject: boolean =
              (typeof tagAttr === "string" &&
                tagAttr?.charAt(0) === "{" &&
                tagAttr?.charAt(tagAttr.length - 1) === "}") ||
              (typeof tagAttr === "string" &&
                tagAttr?.charAt(0) === "[" &&
                tagAttr?.charAt(tagAttr.length - 1) === "]");

            if (isStringifiedObject) {
              tag[tagAttrKey] = JSON.parse(tagAttr);
            }
          }
          properties = segment.tags[tagWithIndex];
        }

        const element = {
          type: "element",
          tagName: tag,
          properties: properties || {},
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

const keepMarkerPlugin = (option: { doc: string }) => {
  const { doc } = option;
  const transformer = (ast: HastRoot) => {
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
          "heading",
          "break",
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
            if (marker !== "#") {
              marker = doc.charAt(node.position?.end?.offset - 1).trim();
            }
            break;
          }
          case "thematicBreak": {
            marker = doc.substring(
              node.position?.start?.offset,
              node.position?.end?.offset,
            );
            break;
          }
          case "break": {
            marker = (marker === " " ? "  " : marker) + "\n";
            break;
          }
        }

        node.marker = marker;
      },
    );
  };
  return transformer;
};

const postProcessHtmlMarker = (option: { doc: string }) => {
  const { doc } = option;
  const allowHtmlTags = ["summary"];
  const transformer = (ast: HastRoot) => {
    visitParents(
      ast,
      (node: any) =>
        node.type === "element" && !node?.properties?.marker && node.position,
      (node: any, parent) => {
        const { start, end } = node.position;
        const text: string = doc.slice(start.offset, end.offset);
        const isHtml: boolean =
          text.indexOf(`<${node.tagName}>`) !== -1 ||
          text.indexOf(`<${node.tagName} `) !== -1 ||
          allowHtmlTags.includes(node.tagName);

        if (isHtml) {
          node.properties = {
            ...node.properties,
            marker: "html",
          };
        }

        if (node.tagName === "pre") {
          const childrenContentLength: number = getChildrenContentLength(node);
          if (childrenContentLength > 1) {
            const preBlock = toHtml(node.children);
            node.children = [{ type: "text", value: "\n" + preBlock }];
          }
        }
      },
    );
  };
  return transformer;
};

const getChildrenContentLength = (node: LayoutElement): number => {
  return node.children.reduce((acc: number, child: any) => {
    if (child.type === "element" || child?.value?.trim()) acc += 1;
    return acc;
  }, 0);
};

const prepareMdast = (option: {
  contentsAvoidMarkdown: PlaceholderContent[];
}) => {
  const { contentsAvoidMarkdown } = option;
  const contentsAvoidMarkdownCopy: PlaceholderContent[] = [
    ...contentsAvoidMarkdown,
  ];

  const transformer = (ast: HastRoot) => {
    visitParents(
      ast,
      (node) =>
        ["link", "yaml", "text", "html", "code", "inlineCode"].includes(
          node.type,
        ),
      (node: any, parent) => {
        if (node.type === "link") {
          const isLinkUrlLAndLinkTextHasSameValue: boolean =
            node.url === node?.children[0]?.value &&
            node.type === "link" &&
            node.marker === "h";

          const isEmail: boolean =
            node.title === null && node.url.includes("mailto:");

          if (isLinkUrlLAndLinkTextHasSameValue || isEmail) {
            node.type = "text";
            node.value = node?.children[0].value;
            delete node.children;
          }
        }

        if (node.type === "yaml") {
          if (contentsAvoidMarkdown.length) {
            contentsAvoidMarkdown.forEach((placeholder: PlaceholderContent) => {
              node.value = node.value.replace(
                placeholder.placeholder,
                placeholder.content,
              );
            });
          }
        }

        if (
          contentsAvoidMarkdownCopy.length &&
          node.type !== "yaml" &&
          "value" in node
        ) {
          const htmlPlaceholders: PlaceholderContent[] =
            contentsAvoidMarkdownCopy.reduceRight(
              (
                acc: PlaceholderContent[],
                curr: PlaceholderContent,
                i: number,
                arr: PlaceholderContent[],
              ) => {
                if (node.value.includes(curr.placeholderWithoutTags)) {
                  acc.push(curr);
                  arr.splice(i, 1);
                }
                return acc;
              },
              [],
            );

          if (htmlPlaceholders.length) {
            htmlPlaceholders.forEach((placeholder: PlaceholderContent) => {
              node.value = node.value.replace(
                placeholder.placeholderWithoutTags,
                placeholder.contentWithoutTags,
              );
              const isNotCodeNode = !["code", "inlineCode"].includes(node.type);
              if (
                AVOID_HTML_TAGS.includes(placeholder.tagName) &&
                isNotCodeNode
              ) {
                node.type = AVOID_HTML_TYPE;
              }
            });
          }
        }
      },
    );
  };
  return transformer;
};

const convertToHtmlType = () => {
  const transformer = (ast: HastRoot) => {
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
                });
                delete child?.properties?.marker;
                child.children = [...newChildren];
              }
            },
          );
          if (node.tagName !== "li") node.type = "html";
        }
        if (node.type === AVOID_HTML_TYPE) node.type = "html";
      },
    );
  };
  return transformer;
};

const footNotePlugin = () => {
  const transformer = (ast: HastRoot) => {
    visitParents(
      ast,
      (node: any) =>
        "properties" in node && node.properties.marker === "footnoteDefinition",
      (node: any) => {
        node.type = "footnoteDefinition";
      },
    );
  };
  return transformer;
};

class MdProcessor extends Processor {
  private yamlProcessor: YamlProcessor;
  private mdastToHastHandlers: Record<string, Function> = {};
  private hastToMdastHandlers: Record<string, Function> = {};
  private passThroughTypes: string[] = ["yaml", "definition", AVOID_HTML_TYPE];
  protected mdast: any = {};

  constructor() {
    super();
    this.yamlProcessor = new YamlProcessor();
  }

  protected getMdastToStringHandlers(): Record<string, Function> {
    let listBulletLastUsed: string[] = [];

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
          const strCode = unified()
            .use(stringify, { fences: false })
            .stringify(codeIndented);
          return strCode.trimRight();
        }
        const exit = state.enter("codeIndented");
        const lineBreak = marker ? "\n" : "";
        const tracker = state.createTracker(info);

        let value = tracker.move(
          marker +
            (node.lang === "no_lang" ? "" : node.lang) +
            (node.meta ? " " : "") +
            (node.meta ? node.meta : "") +
            lineBreak,
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
      emphasis: (
        node: any,
        _: Parent | undefined,
        state: State,
        info: Info,
      ) => {
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
          }),
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
          }),
        );
        value += tracker.move("](" + node.url + ")");
        exit();
        return value;
      },
      inlineCode: (
        node: any,
        _: Parent | undefined,
        state: State,
        info: Info,
      ) => {
        const marker = node.properties?.marker || "<code>";

        const exit = state.enter("blockquote");
        const tracker = state.createTracker(info);
        let value = tracker.move(marker);
        value += tracker.move(
          state.containerPhrasing(node, {
            before: value,
            after: marker,
            ...tracker.current(),
          }),
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
            ?.trimRight(),
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
        listBulletLastUsed.push(marker);
        state.options.listItemIndent = "one";

        let value = tracker.move(
          state.containerFlow(node, {
            ...info,
          }),
        );

        listBulletLastUsed.pop();
        state.bulletCurrent = listBulletLastUsed[listBulletLastUsed.length - 1];
        exit();
        return value;
      },
      thematicBreak: (node: any) => mdastToMdBreakHandler(node),
      break: (node: any) => mdastToMdBreakHandler(node),
      blockquote: (
        node: any,
        _: Parent | undefined,
        state: State,
        info: Info,
      ) => {
        function map(line: string, _: number, blank: boolean): string {
          const row: string = (blank ? "" : " ") + line;

          return line || _ > 0 ? ">" + row : row;
        }

        const exit = state.enter("blockquote");
        const tracker = state.createTracker(info);
        tracker.move("> ");
        tracker.shift(2);
        const value = state.indentLines(
          state.containerFlow(node, tracker.current()),
          map,
        );
        exit();
        return value;
      },
      heading: (node: any, _: Parent | undefined, state: State, info: Info) =>
        headingMdastToMd(node, state, info),
    };
  }

  protected mdParagraphHandler(state: any, node: any, mdast: MdastRoot) {
    const segment: any = convertMdastNodeToText(node, mdast);
    const tagName: string = node.depth ? "h" + node.depth : "p";
    return segmentParentNodeToHast(state, node, segment, tagName);
  }

  protected addMdastToHastHandler(
    handlers: Record<string, Function>,
    nodeHandlers: Record<string, Function>,
  ) {
    this.mdastToHastHandlers = {
      ...this.mdastToHastHandlers,
      ...handlers,
      ...nodeHandlers,
    };
  }

  protected addHastToMdastHandler(
    handlers: Record<string, Function>,
    nodeHandlers: Record<string, Function>,
  ) {
    this.hastToMdastHandlers = {
      ...this.hastToMdastHandlers,
      ...handlers,
      ...nodeHandlers,
    };
  }

  protected addPassThroughTypes(passThroughTypes: string[]) {
    this.passThroughTypes = this.passThroughTypes.concat(passThroughTypes);
  }

  protected parseMarkdownToMdast(doc: string): {
    mdast: MdastRoot;
    newDoc: string;
  } {
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

  public parse(doc: string): Document {
    const { docWithHtmlPlaceholders, contentsAvoidMarkdown } =
      replaceHtmlBeforeMdast(doc);

    const { mdast, newDoc } = this.parseMarkdownToMdast(
      docWithHtmlPlaceholders,
    );
    this.mdast = mdast;

    const hast = unified()
      .use(keepMarkerPlugin, { doc: newDoc })
      .use(prepareMdast, { contentsAvoidMarkdown })
      .use(remark2rehype, {
        passThrough: ["definition"],
        allowDangerousHtml: true,
        unknownHandler: (state, node) => node,
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
            const isTableHeadOnGfmTable: boolean = parent
              ? parent.children.reduce((acc, tableRow, index) => {
                  if (index === 0 && tableRow === node) acc = true;
                  return acc;
                }, false)
              : false;

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
              if (isTableHeadOnGfmTable) cell.tagName = "th";
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
            let levelChildrenInHast: any[] = state.all(node);
            const footnoteLabel = `[^${node.label}]: `;
            if (
              levelChildrenInHast.length &&
              "value" in levelChildrenInHast[0]?.children[0]
            ) {
              levelChildrenInHast[0].children[0].value =
                footnoteLabel + " " + levelChildrenInHast[0].children[0].value;
            }

            return {
              type: "element",
              tagName: "div",
              children: levelChildrenInHast,
              properties: { marker: "footnoteDefinition" },
            };
          },
          listItem: (state, node) => {
            let listItemChildren = state.all(node);
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
              properties: { spread: node.spread.toString() },
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
              children: state.all(node),
            };
          },
          table: (state, node) => {
            const properties: any = { align: JSON.stringify(node.align) };
            if (node.marker) properties.marker = node.marker;
            return {
              type: "element",
              tagName: "table",
              properties,
              children: state.all(node),
            };
          },
          thematicBreak: (h, node) => breakHandler(node),
          break: (h, node) => breakHandler(node),
          definition: (state, node) => node,
          ...this.mdastToHastHandlers,
        },
      })
      .use(raw, { passThrough: this.passThroughTypes } as unknown as Options)
      .use(postProcessHtmlMarker, { doc: docWithHtmlPlaceholders })
      .runSync(mdast) as HastRoot;

    const { layout, segments } = this.hastToSegments(hast);

    removePosition(layout);

    return { layout: layout, segments };
  }

  public stringify(data: Document): string {
    const hast = this.segmentsToHast(data);

    const mdast: MdastRoot = unified()
      .use(footNotePlugin)
      .use(convertToHtmlType)
      .use(
        (options: any) => {
          return (tree: any) => {
            return toMdast(tree, options);
          };
        },
        {
          newlines: true,
        nodeHandlers: {
          definition: (h: any, node: any) => node,
          footnoteDefinition: (h: any, node: any) => {
            const children = h.all(node);

            const textWithLabel = children[0].children[0].value;
            const label = textWithLabel.slice(
              textWithLabel.indexOf("[^") + 2,
              textWithLabel.indexOf("]:"),
            );

            children[0].children[0].value = textWithLabel.replace(
              `[^${label}]: `,
              "",
            );

            return {
              type: "footnoteDefinition",
              identifier: label,
              label,
              children: children,
            };
          },
          html: (h: any, node: any) => {
            node?.properties?.marker === "html" &&
              delete node?.properties?.marker;

            const isAvoidHtmlType: string | undefined = node.value;
            if (isAvoidHtmlType) {
              return {
                type: "paragraph",
                children: [{ type: "text", value: node.value } as HastText],
              };
            }
            const isTagWithHtmlSyntaxInside: boolean = [
              "table",
              "ul",
              "ol",
              "div",
              "dl",
            ].includes(node.tagName);

            if (isTagWithHtmlSyntaxInside) {
              visitParents(
                node,
                (node) => node.type === "html",
                (child, _) => {
                  child.type = "element";
                  delete child?.properties?.marker;
                },
              );
            }
            const outerHtml: string = toHtmlSafe(
              {
                ...node,
                type: "element",
                children: isTagWithHtmlSyntaxInside ? node.children : [],
              },
              { allowDangerousCharacters: true, allowDangerousHtml: true },
            );

            if (isTagWithHtmlSyntaxInside) {
              return {
                type: "paragraph",
                children: [{ type: "text", value: outerHtml }],
              };
            }

            const index: number = outerHtml.indexOf("></");
            const innerNodes = h.all(node);
            const htmlLevel: any = {
              properties: node.properties,
              type: "paragraph",
              children: [
                { type: "text", value: outerHtml.slice(0, index + 1) },
                ...innerNodes,
                { type: "text", value: outerHtml.slice(index + 1) },
              ],
            };
            return htmlLevel;
          },
          yaml: (h: any, node: any) => {
            const yamlStr = this.yamlProcessor.stringify(data);

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
        },
        handlers: {
          pre: (h: any, node: any) => {
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
              const htmlValue = toHtmlSafe(node, {
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
          code: (h: any, node: any) => {
            const inlineCode: any = {
              properties: node.properties,
              type: "inlineCode",
              children: h.all(node),
            };
            return inlineCode;
          },
          img: (h: any, node: any, parent: any) => img(node, parent),
          em: (h: any, node: any) => {
            let emphasis: any = {
              properties: node.properties,
              type: "emphasis",
              children: h.all(node),
            };
            return emphasis;
          },
          strong: (h: any, node: any) => {
            let strong: any = {
              properties: node.properties,
              type: "strong",
              children: h.all(node),
            };
            return strong;
          },
          ol: (h: any, node: any) => listToMdast(h, node, ListTypes.ol),
          ul: (h: any, node: any) => listToMdast(h, node, ListTypes.ul),
          a: (h: any, node: any) => linkHastToMdast(h, node, hast),
          table: (h: any, node: any) => tableHastToMdast(h, node),
          div: (h: any, node: any) => divHastToMdast(h, node),
          hr: (h: any, node: any) => {
            return { type: "thematicBreak", properties: node.properties };
          },
          br: (h: any, node: any) => {
            return { type: "break", properties: node.properties };
          },
          h2: (h: any, node: any) => headerHastToMdast(h, node),
          h1: (h: any, node: any) => headerHastToMdast(h, node),
          ...this.hastToMdastHandlers,
        },
      })
      .runSync(hast) as MdastRoot;

    return this.parseMdastToMarkdown(mdast);
  }

  protected getElementFromConvertHastToSegment(
    node: LayoutElement,
    isNodeList: boolean,
    convertNode: any,
  ): any {
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

    return null;
  }

  private hastToSegments(tree: HastRoot): Document {
    let segments: Segment[] = [];
    const layout: LayoutRoot = root([]);

    const addSegment = (node: any): string => {
      const tags = node.tags;
      const id: string = this.id(
        node.value as string,
        tags,
      );
      const segment: Segment = {
        id,
        text: node.value || "",
        ...(tags && { tags }),
      };

      segments.push(segment);

      return segment.id;
    };

    const checkIsList = (node: LayoutElement): boolean => {
      return (
        "tagName" in node &&
        (node.tagName === ListTypes.ul || node.tagName === ListTypes.ol)
      );
    };

    const convertNode = (node: any) => {
      if (node.type === "text") {
        if (node.value?.trim() === "") {
          return node;
        } else {
          return segment(addSegment(node));
        }
      }

      const isHtmlNode: boolean =
        node.type === "element" && node.properties?.marker === "html";
      if (isHtmlNode && "tagName" in node) {
        if (node.tagName === "li") {
          const listChild: LayoutElement | undefined =
            node.children.find(checkIsList);

          if (listChild) {
            const childrenLength: number = node.children.length - 1;

            node.children = node.children.filter(
              (child: LayoutElement, index: number) => {
                if (!checkIsList(child) && index !== childrenLength) {
                  return child;
                }
              },
            );
          }

          const { text, tags } = hastToString(node);

          const resultNode: LayoutElement = {
            ...node,
            children: [
              element("p", {},
                segment(addSegment({ ...node, value: text, tags })),
              ),
            ],
          };

          if (listChild) {
            "properties" in listChild && (listChild.properties.marker = "html");

            resultNode.children.push(convertNode(listChild));
          }

          return resultNode;
        }

        if (node.tagName === "a" || node.tagName === "img") {
          const { text, tags } = hastToString(node, {
            rootContext: { index: 0 },
          });

          return element("p", {},
            segment(addSegment({ ...node, value: text, tags })),
          );
        }
      }

      const isNodeList: boolean = checkIsList(node);

      const nodeElement = this.getElementFromConvertHastToSegment(
        node,
        isNodeList,
        convertNode,
      );

      if (nodeElement) return nodeElement;

      if (
        node.type === "comment" ||
        node.type === "definition" ||
        node.type === AVOID_HTML_TYPE
      )
        return node;

      if (node.type === "yaml" && node.value) {
        const yamlDoc = this.yamlProcessor.parse(node.value);

        segments = segments.concat(yamlDoc.segments);

        return yamlDoc.layout.children[0];
      }

      throw new Error(`Unsupported node type: ${node.type}`);
    };

    tree.children.forEach((child: any) => {
      visitParents(child, { type: "element" }, (node: any) => {
        if (node.properties?.tags) {
          node.children[0].tags = convertMdastTagsToHast(
            JSON.parse(node.properties.tags),
          );

          delete node.properties.tags;
        }

        const childrenContentLength: number = getChildrenContentLength(node);

        const hasNodeImgOrLink: boolean =
          node.children.findIndex(
            (child: LayoutElement): boolean =>
              "tagName" in child &&
              (child?.tagName === "a" || child?.tagName === "img"),
          ) >= 0;

        if (
          node.tagName === "td" ||
          node.tagName === "th" ||
          hasNodeImgOrLink
        ) {
          if (
            (childrenContentLength > 1 &&
              node.children.some((el: any) => el.type === "element")) ||
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
        (child: any): boolean => child.id === node.id,
      );

      if (parentTemp.children.length === 1) {
        if (parentTemp.tagName === "img") {
          parentTemp.children = structure[0].children;
          parentTemp.properties = structure[0].properties || {};
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
