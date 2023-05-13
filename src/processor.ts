import { visitParents } from "unist-util-visit-parents";
import { unified } from "unified";
import gfm from "remark-gfm";
import parse from "remark-parse";
import { toHtml } from "hast-util-to-html";
import remark2rehype from "remark-rehype";
import rehype2remark from "rehype-remark";
import stringify from "remark-stringify";
import raw from "rehype-raw";
import sanitize from "rehype-sanitize";
import { RootContent } from "hast";
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
  "hr",
];
const allowedTagsRegex = /^\/?[a-zA-Z]+\d+$/;

function replaceHTMLTags(text: string): string {
  const newText: string = text.replace(/\r\n/g, "\n");

  let tagCounter: number = 0;
  let tagsArray: { count: number; tag: string }[] = [];

  return newText.replace(/<(\/?\w+)>/g, (match: string, tag: string) => {
    if (tag.startsWith("/")) {
      const closedCounter = tagsArray[tagsArray.length - 1].count;
      tagsArray.pop();

      return `{${tag}${closedCounter}}`;
    } else {
      tagCounter++;
      tagsArray.push({ count: tagCounter, tag });

      return `{${tag}${tagCounter}}`;
    }
  });
}

function mergeTextNodes(node: any): LayoutNode {
  let propertiesCount: number = 1;
  let properties: Attributes = {};
  let attributes = undefined;

  if (!allowedTags.includes(node.tagName) && node.children) {
    visitParents(node, (child) => {
      if (child.properties && Object.keys(child.properties).length !== 0) {
        properties[child.tagName + propertiesCount] = {
          ...child.properties,
        };
        child.properties = {};

        if (
          child.type === "element" ||
          (child.type === "raw" && !child.value.startsWith("</"))
        ) {
          propertiesCount++;
        }
      }
    });

    let value: string = replaceHTMLTags(
      toHtml(node.children, {
        allowDangerousHtml: true,
        allowDangerousCharacters: true,
      })
    );

    if (Object.keys(properties).length !== 0) {
      attributes = { ...properties };
    }

    node.children = [
      {
        type: "text",
        value: value.replace(/&#x3C;/g, "<").replace(/#x26;/g, ""),
        attributes,
      },
    ];
  }

  return node as LayoutNode;
}

function parseStringToStructure(segment: Segment): RootContent[] {
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
    const mdast = unified().use(parse).use(gfm).parse(doc);
    const mdastWithoutPosition = removePosition(mdast);

    const hast = unified()
      .use(remark2rehype, { allowDangerousHtml: true })
      .use(raw)
      .use(sanitize)
      .runSync(mdastWithoutPosition);

    return this.hastToSegments(hast);
  }

  public stringify(data: Document): string {
    const hast: HastRoot = this.segmentsToHast(data);

    const mdast: MdastRoot = unified()
      .use(rehype2remark, { newlines: true })
      .runSync(hast) as MdastRoot;

    return unified().use(gfm).use(stringify).stringify(mdast) as string;
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

      if (node.type === "element") {
        const children = node.children.map(convertNode);

        return {
          type: node.type,
          tagName: node.tagName,
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

      parent[parent.length - 1].children = structure;
    });

    return data.layout as HastRoot;
  }
}

export default MdProcessor;
