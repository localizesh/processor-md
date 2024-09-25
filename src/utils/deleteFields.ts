const fieldsToDelete: string[] = ["start", "end", "offset", "range", "loc"]

export function deleteFields(obj:any) {
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            deleteFields(obj[i]);
        }
    } else if (typeof obj === 'object') {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (fieldsToDelete.includes(key)) {
                    delete obj[key];
                } else {
                    deleteFields(obj[key]);
                }
            }
        }
    }
}