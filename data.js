const { HTMLField, SchemaField, NumberField, StringField, ArrayField } = foundry.data.fields;

export class BoardData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new HTMLField({ initial: "" }),
            attributes: new SchemaField({
                hp: new SchemaField({ value: new NumberField({ initial: 1, integer: true }), max: new NumberField({ initial: 1, integer: true }) })
            }),
            nodes: new ArrayField(new SchemaField({
                id: new StringField({ required: true, blank: false }),
                type: new StringField({ initial: "actor" }), 
                shape: new StringField({ initial: "circle" }), 
                uuid: new StringField({ initial: "" }),     
                name: new StringField({ initial: () => game.i18n.localize("KEXBORN.NewNode") }),
                img: new StringField({ initial: "" }), 
                status: new StringField({ initial: "none" }), 
                x: new NumberField({ initial: 100 }),
                y: new NumberField({ initial: 100 }),
                width: new NumberField({ initial: 100 }),
                height: new NumberField({ initial: 100 }),
                color: new StringField({ initial: "#ffffff" }) 
            })),
            connections: new ArrayField(new SchemaField({
                id: new StringField({ required: true, blank: false }),
                sourceId: new StringField({ required: true, blank: false }), 
                targetId: new StringField({ required: true, blank: false }), 
                label: new StringField({ initial: "" }),                     
                color: new StringField({ initial: "#ffffff" }),              
                style: new StringField({ initial: "solid" })                 
            }))
        };
    }
}

export class RatingData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new HTMLField({ initial: "" }),
            scoreLabel: new StringField({ initial: () => game.i18n.localize("KEXBORN.MeasureGlory") }),
            attributes: new SchemaField({
                hp: new SchemaField({ value: new NumberField({ initial: 1, integer: true }), max: new NumberField({ initial: 1, integer: true }) })
            }),
            entries: new ArrayField(new SchemaField({
                id: new StringField({ required: true, blank: false }),
                uuid: new StringField({ initial: "" }),
                name: new StringField({ initial: () => game.i18n.localize("KEXBORN.Unknown") }),
                img: new StringField({ initial: "icons/svg/mystery-man.svg" }),
                shortNote: new StringField({ initial: "" }),
                longNote: new StringField({ initial: "" }),
                score: new NumberField({ initial: 0 }),
                rank: new NumberField({ initial: 0 })
            }))
        };
    }
}