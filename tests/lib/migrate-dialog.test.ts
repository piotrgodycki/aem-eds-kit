import { describe, expect, it } from "vitest";
import { parseDialog } from "../../src/lib/migrate/dialog.js";

const DIALOG = `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
    jcr:primaryType="nt:unstructured" jcr:title="Hero" sling:resourceType="cq/gui/components/authoring/dialog">
  <content sling:resourceType="granite/ui/components/coral/foundation/container">
    <items>
      <tabs sling:resourceType="granite/ui/components/coral/foundation/tabs">
        <items>
          <main jcr:title="Main" sling:resourceType="granite/ui/components/coral/foundation/container">
            <items>
              <title sling:resourceType="granite/ui/components/coral/foundation/form/textfield" fieldLabel="Title" name="./title"/>
              <desc sling:resourceType="cq/gui/components/authoring/dialog/richtext" fieldLabel="Description" name="./description"/>
              <size sling:resourceType="granite/ui/components/coral/foundation/form/select" fieldLabel="Size" name="./size">
                <items>
                  <small text="Small" value="sm"/>
                  <large text="Large" value="lg"/>
                </items>
              </size>
              <featured sling:resourceType="granite/ui/components/coral/foundation/form/checkbox" text="Featured" name="./featured" value="{Boolean}true"/>
              <cta sling:resourceType="granite/ui/components/coral/foundation/form/pathfield" fieldLabel="CTA link" name="./ctaLink"/>
            </items>
          </main>
          <cardsTab jcr:title="Cards" sling:resourceType="granite/ui/components/coral/foundation/container">
            <items>
              <cards sling:resourceType="granite/ui/components/coral/foundation/form/multifield" fieldLabel="Cards" name="./cards">
                <field sling:resourceType="granite/ui/components/coral/foundation/container" name="./cards">
                  <items>
                    <cardTitle sling:resourceType="granite/ui/components/coral/foundation/form/textfield" fieldLabel="Card title" name="./cardTitle"/>
                  </items>
                </field>
              </cards>
            </items>
          </cardsTab>
        </items>
      </tabs>
    </items>
  </content>
</jcr:root>`;

describe("parseDialog", () => {
	const { fields, unmapped } = parseDialog(DIALOG);
	const byName = (n: string) => fields.find((f) => f.name === n);

	it("maps Granite field types to UE components", () => {
		expect(byName("title")?.component).toBe("text");
		expect(byName("description")?.component).toBe("richtext");
		expect(byName("size")?.component).toBe("select");
		expect(byName("featured")?.component).toBe("boolean");
		expect(byName("ctaLink")?.component).toBe("aem-content");
	});

	it("extracts select options and defaults", () => {
		expect(byName("size")?.options).toEqual([
			{ name: "Small", value: "sm" },
			{ name: "Large", value: "lg" },
		]);
		expect(byName("featured")?.value).toBe(true);
		expect(byName("title")?.label).toBe("Title");
	});

	it("emits tab markers in order", () => {
		const tabs = fields.filter((f) => f.component === "tab").map((f) => f.label);
		expect(tabs).toEqual(["Main", "Cards"]);
	});

	it("maps a multifield to a repeatable container with sub-fields", () => {
		const cards = byName("cards");
		expect(cards?.component).toBe("container");
		expect(cards?.multi).toBe(true);
		expect(cards?.fields?.[0]).toMatchObject({ component: "text", name: "cardTitle" });
	});

	it("reports nothing unmapped for a standard dialog", () => {
		expect(unmapped).toEqual([]);
	});
});
