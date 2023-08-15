import { Segment } from "../types";

const removeDuplicateSegments = (segments: Segment[]) => {
  const uniqueIds: Set<string> = new Set<string>();
  return segments.filter((segment: Segment) => {
    if (!uniqueIds.has(segment.id)) {
      uniqueIds.add(segment.id);
      return true;
    }
    return false;
  });
};

export default removeDuplicateSegments;
