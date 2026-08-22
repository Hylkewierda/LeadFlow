import { describe, it, expect } from "vitest";
import { PERSONAS, OTHER_KEY, classifyPersona, personaCoverage } from "../src/lib/crm/personas.js";

describe("classifyPersona", () => {
  it.each([
    ["Head of Payments", "payments"],
    ["Payment Operations Manager", "payments"],
    ["CFO", "finance_leadership"],
    ["Chief Financial Officer", "finance_leadership"],
    ["VP Finance", "finance_leadership"],
    ["Financieel Directeur", "finance_leadership"],
    ["Financial Controller", "controller"],
    ["Business Controller", "controller"],
    ["CEO & Founder", "economic_buyer"],
    ["Algemeen Directeur", "economic_buyer"],
    ["Eigenaar", "economic_buyer"],
    ["Accounting Manager", "finance_ops"],
    ["Hoofd Financiële Administratie", "finance_ops"],
    ["Boekhouder", "finance_ops"],
    ["Product Owner", "overig"],
    ["Marketing Coordinator", "overig"],
    ["Operations Coordinator", "overig"],
    ["VP of Finance", "finance_leadership"],
    ["COO", "economic_buyer"],
    ["Business Owner", "economic_buyer"],
    ["Co-founder", "economic_buyer"],
  ])("classificeert %s als %s", (title, expected) => {
    expect(classifyPersona(title, null)).toBe(expected);
  });

  it("prioriteit: payments wint van finance_ops, leiderschap van economic_buyer", () => {
    expect(classifyPersona("Head of Payment Operations", null)).toBe("payments");
    expect(classifyPersona("CFO & co-founder", null)).toBe("finance_leadership");
  });

  it("gebruikt de headline als de rol niets oplevert", () => {
    expect(classifyPersona("Teamlead", "Financial Controller bij ShopCo")).toBe("controller");
  });

  it("valt terug op 'overig' bij geen match of lege input", () => {
    expect(classifyPersona("Growth Marketer", "Growth bij X")).toBe(OTHER_KEY);
    expect(classifyPersona(null, null)).toBe(OTHER_KEY);
    expect(classifyPersona("", "")).toBe(OTHER_KEY);
  });
});

describe("personaCoverage", () => {
  it("markeert aanwezige persona's met namen en geeft alle 5 keys terug", () => {
    const cov = personaCoverage([
      { name: "Ann", persona: "finance_leadership" },
      { name: "Bob", persona: "overig" },
    ]);
    expect(Object.keys(cov).sort()).toEqual(
      PERSONAS.map((p) => p.key).sort()
    );
    expect(cov.finance_leadership).toEqual({ present: true, people: ["Ann"] });
    expect(cov.controller).toEqual({ present: false, people: [] });
  });
});
