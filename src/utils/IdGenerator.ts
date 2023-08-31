import { sha256 } from "js-sha256";
import {Tags} from "../types";

type Content = {
    context: string;
    text: string;
    tags: string;
    index: number;
};

export class IdGenerator {
    private contentMap: Record<string, number>;

    constructor() {
        this.contentMap = {};
    }

    public generateId(text: string | undefined = "", tags: Tags | undefined) {
        const tagsStr = tags ? JSON.stringify(tags) : ""
        const key = text + tagsStr;
        const uniqueId = this.contentMap[key] | 1;
        const content: Content = {
            context: sha256(text),
            text,
            tags: tagsStr,
            index: uniqueId,
        };

        if (this.contentMap.hasOwnProperty(key)) {
            this.contentMap[key] += 1;
        } else {
            this.contentMap[key] = 1;
        }

        return sha256(JSON.stringify(content));
    }
}
