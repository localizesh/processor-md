import { sha256 } from "js-sha256";
import {Context, Tags} from "../types";

type Content = {
    context?: Context;
    text: string;
    tags?: Tags;
    index: number;
};

export class IdGenerator {
    private context: Context;
    private contentMap: Record<string, number>;

    constructor(context: Context) {
        this.context = context;
        this.contentMap = {};
    }

    public generateId(text: string | undefined = "", tags?: Tags) {
        const key = text + tags ? JSON.stringify(tags) : "";
        const uniqueId = this.contentMap[key] | 1;
        const content: Content = {
            context: this.context,
            text,
            tags,
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
