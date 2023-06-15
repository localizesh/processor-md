import jsYaml from 'js-yaml';

const yamlSequenceTags = ['ul', 'li'];


const hastToString = (rootMdast: any) => {
  const mdastToStringRecursive: any = (mdast: any): any => {

    let result: any;
    const isTableTag = mdast?.tagName === "table";
    if (isTableTag) {
      const tbody = mdast?.children[0]
      result = tbody.children.reduce((result: any, value: any) => {
        return {...result, ...mdastToStringRecursive(value)};
      }, {});
    } else if (yamlSequenceTags.includes(mdast?.tagName)) {
      result = mdast.children.map((value: any) => {
        return mdastToStringRecursive(value);
      });
    } else if (mdast?.tagName === "tr") {
      const [key, value] = mdast.children;
      const [keyChild] = key.children;
      const [valueChild] = value.children;

      result = {[keyChild.value]: mdastToStringRecursive(valueChild)};
    } else if (mdast?.type === "text") {
      result = mdast.value;
    }
    return result;
  };

  const yamlObject: Object = mdastToStringRecursive(rootMdast);
  const yamlString: string = jsYaml.dump(yamlObject, {});

  return `---\n${yamlString}---`
}

const stringToHast = (rootString: string) => {
  const yamlObject = jsYaml.load(rootString, {});
  const stringToMdastRecursive: any = (yaml: any) => {

    const isSeq: boolean = Array.isArray(yaml);
    const isMap: boolean = isPlainObject(yaml);

    if (isMap) {
      return {
        type: 'yaml',
        tagName: 'table',
        children: [
          {
            type: 'element',
            tagName: 'tbody',
            children: getPropertiesInYamlObj(yaml, stringToMdastRecursive),
            properties: {}
          }
        ],
        properties: {}
      }
    } else if (isSeq) {
      return {
        type: 'element',
        tagName: 'ul',
        children: yaml.map((value: any, key: any) => {
          return {
            type: 'element',
            tagName: 'li',
            children: [stringToMdastRecursive(value)],
            properties: {}
          }
        }),
        properties: {}
      }
    } else {
      return {
        type: "text",
        value: yaml,
      };
    }
  };
  return stringToMdastRecursive(yamlObject)
}

const getQuotesType = (yaml: string, rootString: string) => {
  const startIndex = rootString.indexOf(yaml)
  const bracket = rootString[startIndex - 1]
  return bracket ? bracket : ''
}

const isPlainObject = function (obj: any): any {
  return Object.prototype.toString.call(obj) === '[object Object]';
};

function getPropertiesInYamlObj(yaml: any, stringToMdastRecursive: any) {
  const children = []
  for (let key in yaml) {
    if (yaml.hasOwnProperty(key)) {
      const value = {
        type: 'element',
        tagName: 'tr',
        children: [
          {
            type: 'element',
            tagName: 'td',
            children: [stringToMdastRecursive(key)],
            properties: {type: 'yamlKey'}},
          {
            type: 'element',
            tagName: 'td',
            children: [stringToMdastRecursive(yaml[key])],
            properties: {type: 'yamlValue'}
          },
        ],
        properties: {}
      }
      children.push(value)
    }
  }
  return children
}

const yaml: {
  hastToString: (rootMdast: any) => string,
  stringToHast: (rootString: string) => any
} = {
  hastToString,
  stringToHast
}

export default yaml
