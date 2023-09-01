export type Tags = {
  [key: string]: { [key: string]: string };
};
export type SegmentsMap = {
  [id: string]: Segment;
};

export type Context = any;

export interface Segment {
  id: string;
  text: string;
  tags?: Tags;
}

export interface LayoutElement {
  value?: string;
  type: string;
  tagName: string;
  tags?: Tags;
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

export interface Document {
  segments: Segment[];
  layout: Layout;
}

export interface Processor {
  parse(doc: string, ctx?: Context): Document;
  stringify(doc: Document, ctx?: Context): string;
}
