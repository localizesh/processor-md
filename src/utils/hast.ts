const HAST_TYPES: string[] = ["element"];
const TEXT_TYPES: string[] = ["text"];
const IMAGE_TAG: string = "img";
const SELF_CLOSING_TAGS: string[] = ["img", "br", "hr"];
import {Tag} from "@localizesh/sdk";

export const hastToString = (rootNode: any, options: any = {}) => {
  const {
    rootContext = {
      index: -1,
      parentTagName: rootNode.tagName,
    },
  } = options;
  let tags: Record<string, Tag> = {};

  const toStringRecursive = (node: any, context: any) => {
    const result = [];
    if (SELF_CLOSING_TAGS.some((el) => el === node.tagName)) {
      context.index++;
      const nodeTagKey = `${node.tagName}${context.index - 1}`;

      if (Object.keys(node.properties).length)
        tags = { ...tags, [nodeTagKey]: node.properties };

      return node.tagName === (IMAGE_TAG && node.properties.alt)
        ? `{${nodeTagKey} alt="${node.properties.alt}"}`
        : `{${nodeTagKey}}`;

    } else if (HAST_TYPES.some((el) => el === node.type)) {
      const isTagOnSourceDoc: boolean = !!node.position;

      isTagOnSourceDoc && context.index++;

      const nodeTagKey = `${node.tagName}${context.index - 1}`;
      const index = context.index;

      const nodePropertiesKeys = Object.keys(node.properties);
      if (nodePropertiesKeys.length) {
        const tagAttributes: Tag = nodePropertiesKeys.reduce((acc: Tag, propKey) => {
          const tagAttributeValue = node.properties[propKey];
          const tagAttributeValueIsObject: boolean = typeof tagAttributeValue === "object";
          acc[propKey] = tagAttributeValueIsObject ? JSON.stringify(tagAttributeValue) : tagAttributeValue;
          return acc;
        }, {})
        tags = { ...tags, [nodeTagKey]: tagAttributes };
      }

      const tagStringOpen = index && isTagOnSourceDoc ? `{${nodeTagKey}}` : ``;
      const tagStringClose =
        index && isTagOnSourceDoc ? `{/${nodeTagKey}}` : ``;

      result.push(
        `${tagStringOpen}${(node.children || [])
          .map((childNode: any) => toStringRecursive(childNode, context))
          .join("")}${tagStringClose}`
      );
    } else if (TEXT_TYPES.some((el) => el === node.type)) {
      node.tags && (tags = { ...tags, ...node.tags });
      result.push(node.value);
    }
    return result.join("");
  };

  return { text: toStringRecursive(rootNode, rootContext), tags };
};
