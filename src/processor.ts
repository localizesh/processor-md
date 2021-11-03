import {Node} from "unist";

interface Processor<T extends Node> {
  parse(doc: string): T;
  stringify(tree: T): string;
}

export default Processor;
