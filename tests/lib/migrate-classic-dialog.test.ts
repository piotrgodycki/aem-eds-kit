import { describe, expect, it } from "vitest";
import { isClassicDialog, parseClassicDialog } from "../../src/lib/migrate/classic-dialog.js";

// Shapes taken from ACS Commons 3.x Classic UI dialogs (AEM 6.x).
const NS = 'xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0"';

const TABBED = `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root ${NS} jcr:primaryType="cq:Dialog" title="Twitter Feed" xtype="tabpanel">
  <items jcr:primaryType="cq:WidgetCollection">
    <twitter jcr:primaryType="cq:Widget" title="Twitter">
      <items jcr:primaryType="cq:WidgetCollection">
        <userName jcr:primaryType="cq:Widget" fieldLabel="Username" name="./username" xtype="textfield"/>
        <limit jcr:primaryType="cq:Widget" fieldLabel="Limit" name="./limit" xtype="numberfield"/>
        <replicate jcr:primaryType="cq:Widget" fieldLabel="Replicate Page?" name="./replicate" type="checkbox" xtype="selection"/>
        <size jcr:primaryType="cq:Widget" fieldLabel="Size" name="./size" type="select" xtype="selection">
          <options jcr:primaryType="cq:WidgetCollection">
            <s jcr:primaryType="nt:unstructured" text="Small" value="sm"/>
            <l jcr:primaryType="nt:unstructured" text="Large" value="lg"/>
          </options>
        </size>
        <agent jcr:primaryType="cq:Widget" name="./agent" type="select" xtype="selection" options="$PATH.agentoptions.json"/>
        <link jcr:primaryType="cq:Widget" fieldLabel="Link" name="./link" xtype="pathfield"/>
        <image jcr:primaryType="cq:Widget" name="./image" fileReferenceParameter="./fileReference" xtype="html5smartimage"/>
        <hint jcr:primaryType="cq:Widget" name="./x@TypeHint" value="String[]" xtype="hidden"/>
      </items>
    </twitter>
  </items>
</jcr:root>`;

describe("parseClassicDialog", () => {
	it("recognises a Classic UI dialog", () => {
		expect(isClassicDialog(TABBED)).toBe(true);
		expect(
			isClassicDialog('<jcr:root sling:resourceType="cq/gui/components/authoring/dialog"/>'),
		).toBe(false);
	});

	it("maps xtypes to UE fields, with tabs, options and datasources", () => {
		const { fields, unmapped, datasourced } = parseClassicDialog(TABBED);
		expect(fields.map((f) => `${f.component}:${f.name}`)).toEqual([
			"tab:twitter",
			"text:username",
			"number:limit",
			"boolean:replicate",
			"select:size",
			"text:agent",
			"aem-content:link",
			"reference:fileReference",
		]);
		expect(fields.find((f) => f.name === "size")?.options).toEqual([
			{ name: "Small", value: "sm" },
			{ name: "Large", value: "lg" },
		]);
		expect(datasourced).toEqual(["agent"]);
		expect(fields.find((f) => f.name === "replicate")?.value).toBeUndefined();
		expect(unmapped).toEqual([]);
	});

	it("reads widgets placed directly under the dialog", () => {
		const { fields } =
			parseClassicDialog(`<jcr:root ${NS} jcr:primaryType="cq:Dialog" xtype="dialog">
  <errorpages jcr:primaryType="cq:Widget" fieldLabel="Error Pages" name="./errorPages" xtype="pathfield"/>
</jcr:root>`);
		expect(fields).toMatchObject([{ component: "aem-content", name: "errorPages" }]);
	});

	it("maps a multifieldpanel to a container and a plain multifield to a multi-value field", () => {
		const { fields } =
			parseClassicDialog(`<jcr:root ${NS} jcr:primaryType="cq:Dialog" xtype="dialog">
  <items jcr:primaryType="cq:WidgetCollection">
    <definitions jcr:primaryType="cq:Widget" fieldLabel="Definitions" name="./definitions" xtype="multifield">
      <fieldConfig jcr:primaryType="cq:Widget" xtype="multifieldpanel">
        <items jcr:primaryType="cq:WidgetCollection">
          <term jcr:primaryType="cq:Widget" key="term" xtype="textfield"/>
          <definition jcr:primaryType="cq:Widget" key="definition" xtype="textarea"/>
        </items>
      </fieldConfig>
    </definitions>
    <columns jcr:primaryType="cq:Widget" fieldLabel="Columns" name="./columns" xtype="multifield">
      <fieldConfig jcr:primaryType="cq:Widget" maxValue="100" xtype="numberfield"/>
    </columns>
  </items>
</jcr:root>`);
		expect(fields[0]).toMatchObject({ component: "container", name: "definitions", multi: true });
		expect(fields[0].fields?.map((f) => f.name)).toEqual(["term", "definition"]);
		expect(fields[1]).toMatchObject({ component: "number", name: "columns", multi: true });
	});

	it("turns the foundation rich-text include into a richtext field", () => {
		const { fields } =
			parseClassicDialog(`<jcr:root ${NS} jcr:primaryType="cq:Dialog" xtype="tabpanel">
  <items jcr:primaryType="cq:WidgetCollection">
    <tab1 jcr:primaryType="cq:Widget" title="Text" xtype="panel"><items jcr:primaryType="cq:WidgetCollection">
      <text jcr:primaryType="cq:Widget" script="rte.textimage.json" xtype="slingscriptinclude"/>
    </items></tab1>
  </items>
</jcr:root>`);
		expect(fields.map((f) => `${f.component}:${f.name}`)).toEqual(["tab:tab1", "richtext:text"]);
	});

	it("resolves a cqinclude tab through the include resolver", () => {
		const xml = `<jcr:root ${NS} jcr:primaryType="cq:Dialog" xtype="tabpanel">
  <items jcr:primaryType="cq:WidgetCollection">
    <args jcr:primaryType="cq:Widget" path="/apps/x/processargs.infinity.json" xtype="cqinclude"/>
    <libs jcr:primaryType="cq:Widget" path="/libs/cq/process_head.infinity.json" xtype="cqinclude"/>
  </items>
</jcr:root>`;
		const { fields } = parseClassicDialog(xml, {
			resolveInclude: (p) =>
				p === "/apps/x/processargs"
					? [
							{
								items: [
									{
										f: [],
										":@": {
											"@_jcr:primaryType": "cq:Widget",
											"@_name": "./target",
											"@_xtype": "textfield",
										},
									},
								],
								":@": { "@_jcr:primaryType": "cq:WidgetCollection" },
							},
						]
					: null,
		});
		expect(fields.map((f) => f.name)).toEqual(["target"]);
	});
});
