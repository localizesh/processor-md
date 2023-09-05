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

    public generateId(text: string | undefined = "", tags?: Tags): string {
        const key: string = text + (tags ? JSON.stringify(tags) : "");

        if (this.contentMap.hasOwnProperty(key)) {
            this.contentMap[key] += 1;
        } else {
            this.contentMap[key] = 1;
        }

        const content: Content = {
            context: this.context,
            text,
            tags,
            index: this.contentMap[key],
        };

        return sha256(JSON.stringify(content));
    }
}
