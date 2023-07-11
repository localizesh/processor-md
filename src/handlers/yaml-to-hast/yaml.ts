import jsYaml from "js-yaml";
import { Element } from "hast";

const yamlSequenceTags = ["ul", "li"];

const quoteCustomCodes: { [key: string]: string } = {
  single: "{$sqc0}",
  double: "{$dqc0}",
};

enum quotesTypes {
  single = "single",
  double = "double",
}

const hastToString = (rootMdast: Element): string => {
  const hastToStringRecursive = (mdast: any): Element => {
    let result: any;
    const isTableTag = mdast?.tagName === "table";
    if (isTableTag) {
      const tbody = mdast?.children[0];
      result = tbody.children.reduce((result: {}, value: Element) => {
        return { ...result, ...hastToStringRecursive(value) };
      }, {});
    } else if (yamlSequenceTags.includes(mdast?.tagName)) {
      const children = mdast.children.map((value: Element) => {
        return hastToStringRecursive(value);
      });
      result = mdast?.tagName === "li" ? children[0] : children;
    } else if (mdast?.tagName === "tr") {
      const [key, value] = mdast.children;
      const [keyChild] = key.children;
      const [valueChild] = value.children;
      const quotes = value?.properties?.quotes;

      const isValueChildNumber = !isNaN(Number(valueChild.value));
      if (isValueChildNumber) valueChild.value = Number(valueChild.value);
      if (quotes && valueChild.value && quoteCustomCodes[quotes]) {
        valueChild.value =
          quoteCustomCodes[quotes] +
          valueChild.value +
          quoteCustomCodes[quotes];
      }

      result = { [keyChild.value]: hastToStringRecursive(valueChild) };
    } else if (mdast?.type === "text") {
      result = mdast.value;
    }
    return result;
  };

  const yamlObject: Object = hastToStringRecursive(rootMdast);

  let yamlString: string = jsYaml.dump(yamlObject, { lineWidth: -1 });
  yamlString = replaceCustomQuotes(yamlString);

  return `---\n${yamlString}---`;
};

const stringToHast = (rootString: string) => {
  const yamlObject = jsYaml.load(rootString, {});
  const stringToMdastRecursive: any = (yaml: any) => {
    const isSeq: boolean = Array.isArray(yaml);
    const isMap: boolean = isPlainObject(yaml);

    if (isMap) {
      return {
        type: "yaml",
        tagName: "table",
        children: [
          {
            type: "element",
            tagName: "tbody",
            children: getPropertiesInYamlObj(
              yaml,
              stringToMdastRecursive,
              rootString
            ),
            properties: {},
          },
        ],
        properties: {},
      };
    } else if (isSeq) {
      return {
        type: "element",
        tagName: "ul",
        children: yaml.map((value: Element) => {
          return {
            type: "element",
            tagName: "li",
            children: [stringToMdastRecursive(value)],
            properties: {},
          };
        }),
        properties: {},
      };
    } else {
      return {
        type: "text",
        value: yaml,
      };
    }
  };
  return stringToMdastRecursive(yamlObject);
};

const getQuotesType = (yaml: string, rootString: string) => {
  const startIndex = rootString.indexOf(yaml);
  const bracket = rootString[startIndex - 1];
  if (!bracket || !bracket.trim()) {
    return "";
  } else {
    return bracket === `'` ? quotesTypes.single : quotesTypes.double;
  }
};

const replaceCustomQuotes = (str: string): string => {
  return str
    .replaceAll(`'${quoteCustomCodes.double}`, `"`)
    .replaceAll(`${quoteCustomCodes.double}'`, `"`)
    .replaceAll(`'${quoteCustomCodes.single}`, `'`)
    .replaceAll(`${quoteCustomCodes.single}'`, `'`)
    .replaceAll(quoteCustomCodes.single, `'`)
    .replaceAll(quoteCustomCodes.double, `"`);
};

const isPlainObject = function (obj: Object): boolean {
  return Object.prototype.toString.call(obj) === "[object Object]";
};

function getPropertiesInYamlObj(
  yaml: { [key: string]: string },
  stringToHastRecursive: any,
  rootString: string
) {
  const children = [];
  for (let key in yaml) {
    if (yaml.hasOwnProperty(key)) {
      const yamlKey = stringToHastRecursive(key);
      const yamlValue = stringToHastRecursive(yaml[key]);

      let yamlKeyProperties: any = { type: "yamlKey" };
      let yamlValueProperties: any = { type: "yamlValue" };

      if (yamlValue.type === "text") {
        yamlValue.value = yamlValue.value.toString();
        const quotes = getQuotesType(yamlValue.value, rootString);
        if (quotes) yamlValueProperties = { ...yamlValueProperties, quotes };
      }

      const value = {
        type: "element",
        tagName: "tr",
        children: [
          {
            type: "element",
            tagName: "td",
            children: [yamlKey],
            properties: yamlKeyProperties,
          },
          {
            type: "element",
            tagName: "td",
            children: [yamlValue],
            properties: yamlValueProperties,
          },
        ],
        properties: {},
      };
      children.push(value);
    }
  }
  return children;
}

const yaml: {
  hastToString: (rootHast: Element) => string;
  stringToHast: (rootString: string) => Element;
} = {
  hastToString,
  stringToHast,
};

export default yaml;
