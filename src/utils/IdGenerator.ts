import { sha256 } from "js-sha256";

type Content = {
    resourceId: string;
    text: string;
    tags: string;
    index: number;
};

export class IdGenerator {
    private segmentsMap: Record<string, number>;

    constructor() {
        this.segmentsMap = {};
    }

    public generateId(text: string | undefined = "", otherStrings: Record<string, string>) {
        const otherString = Object.values(otherStrings).join("");
        const key = text + otherString;
        const uniqueId = this.segmentsMap[key] ? this.segmentsMap[key] : 1;

        const content: Content = {
            resourceId: "123",
            text,
            tags: otherString,
            index: uniqueId,
        };

        if (this.segmentsMap.hasOwnProperty(key)) {
            this.segmentsMap[key] += 1;
        } else {
            this.segmentsMap[key] = 1;
        }

        return sha256(JSON.stringify(content));
    }
}
