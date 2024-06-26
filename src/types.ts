import {Segment, LayoutElement, Tags} from "@localizesh/sdk";

export type SegmentsMap = {
  [id: string]: Segment;
};

export interface LayoutElementWithTags extends LayoutElement {
  tags?: Tags
};
