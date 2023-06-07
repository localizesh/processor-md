import { Element } from "hast";

export default function img(node: Element, parent: any): any {
  if (parent?.type === "element") {
    const { src = "", title = null, alt = "" } = node.properties || {};

    return {
      type: "image",
      url: src,
      title,
      alt,
    };
  } else {
    let html = `<${node.tagName}`;

    if (node.properties) {
      Object.keys(node.properties).forEach((key) => {
        //@ts-ignore
        const value = node.properties[key];
        html += ` ${key}="${value}"`;
      });
    }

    html += ">";

    return {
      type: "html",
      value: html,
    };
  }
}
