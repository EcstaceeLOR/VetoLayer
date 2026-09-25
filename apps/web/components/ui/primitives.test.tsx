import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, Button, EmptyState, Field, Input, OutcomeBadge } from "./primitives";

describe("VetoLayer UI primitives", () => {
  it("maps button tone and size to the shared design-system classes", () => {
    const html = renderToStaticMarkup(<Button tone="primary" size="lg">Continue</Button>);
    expect(html).toContain("vlButton");
    expect(html).toContain("vlButtonPrimary");
    expect(html).toContain("vlButtonLg");
  });

  it("communicates outcomes with text and a non-color symbol", () => {
    expect(renderToStaticMarkup(<OutcomeBadge outcome="ALLOW" />)).toContain("✓");
    expect(renderToStaticMarkup(<OutcomeBadge outcome="REVIEW" />)).toContain("!");
    expect(renderToStaticMarkup(<OutcomeBadge outcome="BLOCK" />)).toContain("×");
  });

  it("keeps field labels visible and hints adjacent to controls", () => {
    const html = renderToStaticMarkup(
      <Field label="Project" hint="Used in receipts and filters."><Input name="project" /></Field>,
    );
    expect(html).toContain("Project");
    expect(html).toContain("Used in receipts and filters.");
    expect(html).toContain("vlInput");
  });

  it("renders empty states through the shared surface contract", () => {
    const html = renderToStaticMarkup(<EmptyState title="Nothing here" copy="Create the first item." icon="+" />);
    expect(html).toContain("vlEmpty");
    expect(html).toContain("Nothing here");
  });

  it("supports semantic non-decision badge tones", () => {
    const html = renderToStaticMarkup(<Badge tone="warning">Needs setup</Badge>);
    expect(html).toContain("vlBadgeWarning");
  });
});
