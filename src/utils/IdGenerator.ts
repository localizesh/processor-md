import { sha256 } from "js-sha256";

type Content = {
    resourceId: string;
    text: string;
    tags: string;
    index: number;
};

export class IdGenerator {
    private contentMap: Record<string, number>;

    constructor() {
        this.contentMap = {};
    }

    public generateId(text: string | undefined = "", tags: string | undefined = "") {
        const key = text + tags;
        const uniqueId = this.contentMap[key] | 1;

        const content: Content = {
            resourceId: "123",
            text,
            tags: tags,
            index: uniqueId,
        };

        if (this.contentMap.hasOwnProperty(key)) {
            this.contentMap[key] += 1;
        } else {
            this.contentMap[key] = 1;
        }

        console.log("content QQ: ", content)
        console.log("this.contentMap QQ: ", this.contentMap)

        return sha256(JSON.stringify(content));
    }
}
