import { visit } from "unist-util-visit";
import { unified } from "unified";
import gfm from "remark-gfm";
import parse from "remark-parse";
import { toHtml } from "hast-util-to-html";
import remark2rehype from "remark-rehype";
import raw from "rehype-raw";
import sanitize from "rehype-sanitize";
import { Root, RootContent } from "hast";
import {
  Attributes,
  Layout,
  LayoutElement,
  LayoutNode,
  Segment,
  Document,
  Processor,
} from "./types";
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
    visit(node, (child) => {
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

    const value: string = replaceHTMLTags(
      toHtml(node.children, { allowDangerousHtml: true })
    );

    if (Object.keys(properties).length !== 0) {
      attributes = { ...properties };
    }

    node.children = [{ type: "text", value, attributes }];
  }

  return node as LayoutNode;
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

  public stringify(data: Document) {
    throw new Error("Not implemented");

    return JSON.stringify(data);
  }

  private hastToSegments(tree: Root): Document {
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
}

export default MdProcessor;
