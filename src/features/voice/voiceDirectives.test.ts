import { describe, expect, it } from "vitest";
import {
  normalizeName,
  parseVoiceDictation,
  resolveName,
} from "./voiceDirectives";

describe("parseVoiceDictation", () => {
  it("files a PT list into a notebook with a tag", () => {
    expect(
      parseVoiceDictation(
        "Crie uma lista de compras no caderno Casa com a tag mercado: leite e pão",
      ),
    ).toEqual({
      plan: { kind: "list", listType: "bullet", items: ["leite", "pão"] },
      organize: { notebook: "Casa", tags: ["mercado"] },
    });
  });

  it("files an EN to-do list with several tags", () => {
    expect(
      parseVoiceDictation(
        "Make a to-do list in the notebook Work with tags launch and urgent: call the printer, send the invoice",
      ),
    ).toEqual({
      plan: {
        kind: "list",
        listType: "task",
        items: ["call the printer", "send the invoice"],
      },
      organize: { notebook: "Work", tags: ["launch", "urgent"] },
    });
  });

  it("accepts tags before the notebook", () => {
    const { organize } = parseVoiceDictation(
      "Com as tags ideias, produto e no caderno Projetos Pessoais: testar o fluxo",
    );
    expect(organize).toEqual({
      notebook: "Projetos Pessoais",
      tags: ["ideias", "produto"],
    });
  });

  it("files plain dictation when the header holds only directives", () => {
    expect(
      parseVoiceDictation("No caderno Casa: comprar tinta para a sala."),
    ).toEqual({
      plan: { kind: "text", text: "comprar tinta para a sala." },
      organize: { notebook: "Casa", tags: [] },
    });
  });

  it("takes a spoken title and keeps the rest as the body", () => {
    expect(
      parseVoiceDictation(
        "Título: Reunião de sexta. Decidimos lançar em outubro.",
      ),
    ).toEqual({
      plan: { kind: "text", text: "Decidimos lançar em outubro." },
      organize: { title: "Reunião de sexta", tags: [] },
    });
  });

  it("combines a title, a notebook, and a list", () => {
    const dictation = parseVoiceDictation(
      "Title: Groceries. Create a shopping list into notebook Home: milk and eggs",
    );
    expect(dictation.organize).toEqual({
      title: "Groceries",
      notebook: "Home",
      tags: [],
    });
    expect(dictation.plan).toEqual({
      kind: "list",
      listType: "bullet",
      items: ["milk", "eggs"],
    });
  });

  it("leaves ordinary dictation with a colon untouched", () => {
    const text = "Horário: dez horas, levar o caderno azul.";
    expect(parseVoiceDictation(text)).toEqual({
      plan: { kind: "text", text },
      organize: { tags: [] },
    });
  });

  it("ignores notebook words after the first colon", () => {
    const text = "Lembrar: deixar o notebook no caderno de visitas";
    expect(parseVoiceDictation(text).organize).toEqual({ tags: [] });
  });

  it("keeps the existing list behavior when no directive is spoken", () => {
    expect(parseVoiceDictation("Lista de compras: arroz e feijão")).toEqual({
      plan: { kind: "list", listType: "bullet", items: ["arroz", "feijão"] },
      organize: { tags: [] },
    });
  });

  it("strips a spoken hash from tag names", () => {
    expect(
      parseVoiceDictation("With tag #ideas: a calmer sidebar").organize.tags,
    ).toEqual(["ideas"]);
  });
});

describe("resolveName", () => {
  const notebooks = [
    { id: "nb-1", name: "Casa" },
    { id: "nb-2", name: "Casa de Praia" },
    { id: "nb-3", name: "Café" },
  ];

  it("matches existing names ignoring case and accents", () => {
    expect(resolveName("cafe", notebooks)).toEqual({
      id: "nb-3",
      name: "Café",
    });
    expect(normalizeName("  Música ")).toBe("musica");
  });

  it("prefers the longest existing name at the start of the phrase", () => {
    expect(resolveName("Casa de Praia amanhã", notebooks)).toEqual({
      id: "nb-2",
      name: "Casa de Praia",
    });
  });

  it("returns a new name when nothing matches", () => {
    expect(resolveName("Viagens", notebooks)).toEqual({ name: "Viagens" });
  });
});
