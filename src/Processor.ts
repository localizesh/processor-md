import { Properties } from "hast";

export type Attributes = {
  [key: string]: { [key: string]: string };
};

export interface Segment {
  id: string;
  text: string;
  attributes?: Attributes;
}

export interface LayoutElement {
  value: string;
  type: string;
  tagName: string;
  attributes?: Attributes;
  properties: Properties;
  children: LayoutNode[];
}

export interface LayoutSegment {
  type: "segment";
  id: string;
}

export type LayoutNode = LayoutElement | LayoutSegment;

export interface Layout {
  type: "root";
  children: LayoutNode[];
}

export interface SegmentStructure {
  layout: Layout;
  segments: Segment[];
}

export default interface Processor<T extends SegmentStructure> {
  parse(doc: string): T;
  stringify(tree: T): string;
}
