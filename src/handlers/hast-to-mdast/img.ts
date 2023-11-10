import { toHtml } from "hast-util-to-html";

export default function img(node: any, parent: any): any {
  const isNodeSyntaxHtml: boolean = !node.properties?.marker;

  if (isNodeSyntaxHtml) {
    const res: string = toHtml(node);
    return { type: "html", value: res };
  }

  if (parent?.type === "element" || parent?.type === "html") {
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
