import { describe, expect, it } from "vitest";
import { countLeafFields, parseDialog } from "../../src/lib/migrate/dialog.js";

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
              <featured sling:resourceType="granite/ui/components/coral/foundation/form/checkbox" text="Featured" name="./featured" value="{Boolean}true" checked="{Boolean}true"/>
              <newTab sling:resourceType="granite/ui/components/coral/foundation/form/checkbox" text="Open in new tab" name="./newTab" value="_blank" uncheckedValue="_self"/>
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
		expect(byName("featured")?.value).toBe(true); // checked="true"
		expect(byName("newTab")?.value).toBeUndefined(); // value is the ticked value, not a default
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

const wrap = (items: string) => `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="s" xmlns:jcr="j" sling:resourceType="cq/gui/components/authoring/dialog">
  <content sling:resourceType="granite/ui/components/coral/foundation/container"><items>${items}</items></content>
</jcr:root>`;

describe("parseDialog — AEMaaCS / AEM 6.5 field types", () => {
	it("maps the Core Components page, XF and CF pickers", () => {
		const { fields, unmapped } = parseDialog(
			wrap(`
      <link sling:resourceType="cq/gui/components/coral/common/form/pagefield" name="./linkURL"/>
      <xf sling:resourceType="cq/experience-fragments/editor/components/xffield" name="./fragmentVariationPath"/>
      <cf sling:resourceType="dam/cfm/components/cfpicker" name="./fragmentPath"/>
      <color sling:resourceType="granite/ui/components/coral/foundation/form/colorfield" name="./color"/>`),
		);
		expect(fields.map((f) => f.component)).toEqual([
			"aem-content",
			"aem-experience-fragment",
			"aem-content-fragment",
			"text",
		]);
		expect(unmapped).toEqual([]);
	});

	it("skips hidden fields without reporting them (Coral 2 and Coral 3)", () => {
		const { fields, unmapped } = parseDialog(
			wrap(`
      <a sling:resourceType="granite/ui/components/foundation/form/hidden" name="./textIsRich" value="true"/>
      <b sling:resourceType="/libs/granite/ui/components/coral/foundation/form/hidden" name="./x@Delete"/>
      <t sling:resourceType="granite/ui/components/foundation/form/textfield" name="./title"/>`),
		);
		expect(fields.map((f) => f.name)).toEqual(["title"]);
		expect(unmapped).toEqual([]);
	});

	it("names a composite multifield after its field child", () => {
		const { fields } = parseDialog(
			wrap(`
      <actions sling:resourceType="granite/ui/components/coral/foundation/form/multifield" composite="{Boolean}true">
        <field sling:resourceType="granite/ui/components/coral/foundation/container" name="./actions"><items>
          <text sling:resourceType="granite/ui/components/coral/foundation/form/textfield" name="./text"/>
        </items></field>
      </actions>`),
		);
		expect(fields[0]).toMatchObject({ component: "container", name: "actions", multi: true });
	});

	it("keeps the first of two fields with the same name", () => {
		const { fields } = parseDialog(
			wrap(`
      <a sling:resourceType="granite/ui/components/coral/foundation/form/select" name="./titleType" fieldLabel="Heading Element"/>
      <b sling:resourceType="granite/ui/components/coral/foundation/form/select" name="./titleType" fieldLabel="Title Type"/>`),
		);
		expect(fields).toHaveLength(1);
		expect(fields[0].label).toBe("Heading Element");
	});

	it("pulls in includes through the resolver and drops tabs left empty", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:sling="s" xmlns:jcr="j"><content><items><tabs sling:resourceType="granite/ui/components/coral/foundation/tabs"><items>
  <link jcr:title="Link" sling:resourceType="granite/ui/components/coral/foundation/container"><items>
    <inc sling:resourceType="granite/ui/components/coral/foundation/include" path="/mnt/overlay/x/link"/>
  </items></link>
  <styles jcr:title="Styles" sling:resourceType="granite/ui/components/coral/foundation/container"><items>
    <inc sling:resourceType="granite/ui/components/coral/foundation/include" path="/mnt/overlay/cq/styletab"/>
  </items></styles>
</items></tabs></items></content></jcr:root>`;
		const { fields } = parseDialog(xml, {
			resolveInclude: (p) =>
				p === "/mnt/overlay/x/link"
					? [
							{
								url: [],
								":@": {
									"@_sling:resourceType": "cq/gui/components/coral/common/form/pagefield",
									"@_name": "./linkURL",
								},
							},
						]
					: null,
		});
		expect(fields.map((f) => `${f.component}:${f.name}`)).toEqual([
			"tab:link",
			"aem-content:linkURL",
		]);
	});

	it("gives datasource selects static options, or falls back to text", () => {
		const { fields, datasourced } = parseDialog(
			wrap(`
      <titleType sling:resourceType="granite/ui/components/coral/foundation/form/select" name="./titleType">
        <datasource sling:resourceType="core/wcm/components/commons/datasources/allowedheadingelements/v1"/>
      </titleType>
      <preset sling:resourceType="granite/ui/components/coral/foundation/form/select" name="./imagePreset">
        <datasource sling:resourceType="dam/components/scene7/common/imagepresetsdatasource"/>
      </preset>`),
		);
		expect(fields[0]).toMatchObject({ component: "select", name: "titleType" });
		expect(fields[0].options).toHaveLength(6);
		expect(fields[1]).toMatchObject({ component: "text", name: "imagePreset" });
		expect(datasourced).toEqual(["imagePreset"]);
	});

	it("counts no leaf fields for a dialog of tabs only", () => {
		const { fields } = parseDialog(
			wrap(`<tabs sling:resourceType="granite/ui/components/coral/foundation/tabs"><items>
        <a jcr:title="A" sling:resourceType="granite/ui/components/coral/foundation/container"/>
      </items></tabs>`),
		);
		expect(countLeafFields(fields)).toBe(0);
	});
});
