import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "./voiceCommandParser";

describe("parseVoiceCommand", () => {
  it("splits a PT shopping-list command into bullet items", () => {
    const plan = parseVoiceCommand(
      "Construa uma lista de compras: leite, pão, ovos e café.",
    );
    expect(plan).toEqual({
      kind: "list",
      listType: "bullet",
      items: ["leite", "pão", "ovos", "café"],
    });
  });

  it("recognizes a PT to-do list command as a task list", () => {
    const plan = parseVoiceCommand(
      "Crie uma lista de tarefas: lavar roupa, estudar e correr",
    );
    expect(plan).toEqual({
      kind: "list",
      listType: "task",
      items: ["lavar roupa", "estudar", "correr"],
    });
  });

  it("recognizes a bare PT list prefix with a colon", () => {
    const plan = parseVoiceCommand("Lista de compras: arroz e feijão");
    expect(plan).toEqual({
      kind: "list",
      listType: "bullet",
      items: ["arroz", "feijão"],
    });
  });

  it("splits an EN shopping-list command into bullet items", () => {
    const plan = parseVoiceCommand(
      "Create a shopping list: milk, bread and eggs",
    );
    expect(plan).toEqual({
      kind: "list",
      listType: "bullet",
      items: ["milk", "bread", "eggs"],
    });
  });

  it("recognizes an EN to-do list command as a task list", () => {
    const plan = parseVoiceCommand("Build a to-do list: call mom, pay bills");
    expect(plan).toEqual({
      kind: "list",
      listType: "task",
      items: ["call mom", "pay bills"],
    });
  });

  it("is case-insensitive", () => {
    const plan = parseVoiceCommand("CONSTRUA UMA LISTA DE COMPRAS: Leite, Pão");
    expect(plan).toEqual({
      kind: "list",
      listType: "bullet",
      items: ["Leite", "Pão"],
    });
  });

  it("treats plain dictation with no trigger phrase as text", () => {
    const text = "Isso é só uma nota normal sobre o meu dia.";
    expect(parseVoiceCommand(text)).toEqual({ kind: "text", text });
  });

  it("falls back to text when the trigger matches but no items follow", () => {
    const text = "Construa uma lista de compras";
    expect(parseVoiceCommand(text)).toEqual({ kind: "text", text });
  });

  it("falls back to text when a list word appears mid-sentence, not as a command", () => {
    const text = "Eu vi a lista de compras na mesa da cozinha.";
    expect(parseVoiceCommand(text)).toEqual({ kind: "text", text });
  });
});
