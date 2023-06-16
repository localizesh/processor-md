import { visitParents } from "unist-util-visit-parents";
import { unified } from "unified";
import gfm from "remark-gfm";
import parse from "remark-parse";
import remark2rehype from "remark-rehype";
import rehype2remark from "rehype-remark";
import stringify from "remark-stringify";
import raw from "rehype-raw";
import { Element } from "hast";
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

const convertMdastTagToHast = (tag: string) => {
  const tagsMap: Record<string, string> = {
    "link": "a",
    "inlineCode": "code"
  }

  return tagsMap[tag] ? tagsMap[tag] : tag
}

const convertMdastAttributesToHast = (attributes: any) => {
  let newAttributes: Attributes = {};
  const attributesMapLinks: Record<string, string> = {
    "url": "href"
  }
  const attributesMapImg: Record<string, string> = {
    "url": "src"
  }

  for (const key in attributes) {
    if (attributes.hasOwnProperty(key)) {
      const innerObject = attributes[key];
      const transformedInnerObject: any = {};
      const attributesMap = key.includes("image") ? attributesMapImg : attributesMapLinks

      for (const innerKey in innerObject) {
        if (innerObject.hasOwnProperty(innerKey)) {
          if (attributesMap.hasOwnProperty(innerKey)) {
            transformedInnerObject[attributesMap[innerKey]] = innerObject[innerKey];
          } else {
            transformedInnerObject[innerKey] = innerObject[innerKey];
          }
        }
      }

      newAttributes[key] = transformedInnerObject;
    }
  }

  return newAttributes
}

const allowedTagsRegex = /^\/?[a-zA-Z]+\d+$/;

function convertMdastNodeToText(node: any) {
  let value = "";
  let tagCount = 0;
  let attributes: Attributes = {};
  const tags: { index: number; name: string, isClosed: boolean }[] = [];

  visitParents(node, (child, parent) => {
    if(parent.length === 0){
      return;
    }

    if (child.type === "text") {
      value += child.value;
    } else {

      const tagName = convertMdastTagToHast(child.type)
      const tagNameWithIndex = tagName + tagCount
      const openedTag = "{" + tagNameWithIndex + "}";
      const newTag = { index: tagCount, name: child.type, isClosed: false }

      value += openedTag;
      if(child.value){
        value += child.value;
        newTag.isClosed = true
      }

      tags.push(newTag);

      //todo
      if (child.url) {
        attributes[tagNameWithIndex] = {...attributes[tagNameWithIndex], url: child.url};
      }

      if (child.title) {
        attributes[tagNameWithIndex] = {...attributes[tagNameWithIndex], title: child.title};
      }

      if (child.alt) {
        attributes[tagNameWithIndex] = {...attributes[tagNameWithIndex], alt: child.alt};
      }

      tagCount++;
    }

    if (tags.length > 0) {
      tags.slice().reverse().forEach((tag, i)=>{
        const currentParent = parent[parent.length - (i + 1)]
        if (tag.isClosed ||
            (child.type !== "text" && currentParent?.type === tag.name) ||
            (child.type === "text" && currentParent.children[currentParent.children.length - 1].value === child.value)) {
          const { index, name } = tag;
          const tagName = convertMdastTagToHast(name)
          const tagNameWithIndex = tagName + index
          const closedTag = "{/" + tagNameWithIndex + "}";

          value += closedTag;
          tags.pop();
        }
      })
    }
  });

  if (tags.length > 0) {
    tags.reverse().map(({ index, name }) => {
      const tagName = convertMdastTagToHast(name)
      const tagNameWithIndex = tagName + index
      const closedTag: string = "{/" + tagNameWithIndex + "}";

      value += closedTag;
    });
  }

  if (value) {
    return {
      type: "text",
      value: value,
      attributes: Object.keys(attributes).length > 0 ? {attributes: JSON.stringify(attributes)} : {},
    };
  }

  return null;
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
    const mdast = unified().use(parse).use(gfm).parse(doc);
    const mdastWithoutPosition = removePosition(mdast);

    const hast = unified()
        .use(remark2rehype, { allowDangerousHtml: true,
          handlers: {
            paragraph:(state, node) => {
              const segment: any = convertMdastNodeToText(node)


              return {
                type: 'element',
                tagName: 'p',
                properties: segment.attributes,
                children: [segment]
              }
            }
          }
        })
        .use(raw)
        // .use(sanitize)
        .runSync(mdastWithoutPosition);

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

      if (node.type === "element") {
        const children: LayoutNode[] = node.children.map(convertNode);

        return {
          ...node,
          children: children,
        };
      }

      throw new Error(`Unsupported node type: ${node.type}`);
    };

    tree.children.forEach((child: any) => {
      if(child.properties?.attributes){
        child.children[0].attributes = convertMdastAttributesToHast(JSON.parse(child.properties.attributes))
        delete child.properties.attributes
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
