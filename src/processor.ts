import { visitParents } from "unist-util-visit-parents";
import { unified } from "unified";
import gfm from "remark-gfm";
import parse from "remark-parse";
import remark2rehype from "remark-rehype";
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

const inlineTags = ["code", "b", "em", "a", "img", "strong", "kbd"];

const allowedTags = [
  "blockquote",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "th",
  "tr",
  "td",
  "pre",
];
const unallowedTags = [
  "code",
];

const allowedTagsRegex = /^\/?[a-zA-Z]+\d+$/;

function convertNodeToText(node: any) {
  let value = "";
  let tagCount = 0;
  let attributes: Attributes = {};
  const tags: { index: number; name: string }[] = [];

  visitParents(node, (child, parent) => {
    if (child.type === "text") {
      value += child.value;
    } else {
      if (inlineTags.includes(child.tagName)) {
        const openedTag = "{" + child.tagName + tagCount + "}";

        value += openedTag;
        tags.push({ index: tagCount, name: child.tagName });

        if (Object.keys(child.properties).length !== 0) {
          attributes[child.tagName + tagCount] = child.properties;
        }

        tagCount++;
      }
    }

    const noChildrenElement: boolean = !child.children || child.children && child.children.length === 0
    if (tags.length > 0 && noChildrenElement) {
      tags.slice().reverse().forEach((tag, i)=>{
        if (parent[parent.length - (i + 1)]?.tagName === tag.name) {
          const { index, name } = tag;
          const closedTag = "{/" + name + index + "}";

          value += closedTag;
          tags.pop();
        }
      })
    }
  });

  if (tags.length > 0) {
    tags.reverse().map(({ index, name }) => {
      const closedTag: string = "{/" + name + index + "}";

      value += closedTag;
    });
  }

  if (value) {
    return {
      type: "text",
      value: value,
      attributes,
    };
  }

  return null;
}

function mergeTextNodes(node: any): LayoutNode {
  visitParents(node, { type: "element" }, (child) => {
    const isChildTagNotAllowed = unallowedTags.includes(child.tagName);
    const isSingleChildTagNotAllowed =
        child.children.length === 1 &&
        unallowedTags.includes(child.children[0].tagName);

    if (!isChildTagNotAllowed && !isSingleChildTagNotAllowed) {
      const hasAllowedTag = child.children.some((element: any) =>
          allowedTags.includes(element.tagName)
      );

      if (!hasAllowedTag) {
        const convertedNode = convertNodeToText(child)

        child.children = convertedNode
            ? [convertedNode]
            : [];
      }
    }
  });

  return node as LayoutNode;
}

function parseStringToStructure(segment: Segment): Element[] {
  const text: string = segment.text;
  const stack = [];
  let currentText: string = "";
  let properties = {};

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

class MdProcessor implements Processor {
  public parse(doc: string) {
    const mdast = unified().use(parse)
      .use(remarkFrontmatter, ['yaml'])
      .use(gfm)
      .parse(doc);
    const mdastWithoutPosition = removePosition(mdast);


    const hast = unified()
      .use(remark2rehype, {
        allowDangerousHtml: true,
        handlers: {
          yaml: (h, node, parent) => yaml.stringToHast(node.value)
        }
      })
      .use(raw, {passThrough: ['yaml']})
      .runSync(mdastWithoutPosition);

    //@ts-ignore
    return this.hastToSegments(hast);
  }

  public stringify(data: Document): string {
    // const hast: HastRoot = this.segmentsToHast(data);
    const hast: HastRoot = this.segmentsToHast(data);

    const mdast: MdastRoot = unified()
      .use(rehype2remark, {
        newlines: true,
        handlers: {
          img: (h, node, parent) => img(node, parent),
          yaml: (h, node, parent) => {
            const result = yaml.hastToString(node)
            return {
              type: 'paragraph',
              position: undefined,
              children: [
                {
                  type: 'text',
                  value: result
                }
              ]
            }
          }
        },
      })
      .runSync(hast) as MdastRoot;

    return unified().use(gfm).use(stringify, {
      handlers: {
        text: (node) => node.value
      },
    }).stringify(mdast) as string;
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
      if (node.type === "text" || node.type === "raw") {
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

      throw new Error(`Unsupported node type: ${node.type}`);
    };

    tree.children.forEach((child: RootContent) => {
      layoutTemp.children.push(mergeTextNodes(child));
    });

    layoutTemp.children.forEach((child: LayoutNode) => {
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
