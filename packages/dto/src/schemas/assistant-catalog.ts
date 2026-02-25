import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import {
  assistantAppointmentTableRowSchema,
  assistantClientTableRowSchema,
} from "./assistant";

export const assistantCatalog = defineCatalog(schema, {
  actions: {},
  components: {
    Paragraph: {
      props: z.object({ text: z.string() }),
      slots: [],
      description: "Plain text paragraph for explanations or summaries.",
    },
    ClientTable: {
      props: z.object({
        rows: z.array(assistantClientTableRowSchema),
      }),
      slots: [],
      description:
        "Table displaying client search results (name, email, phone, appointment count).",
    },
    AppointmentTable: {
      props: z.object({
        rows: z.array(assistantAppointmentTableRowSchema),
      }),
      slots: [],
      description:
        "Table displaying appointment results (client, start time, status, calendar).",
    },
    InfoList: {
      props: z.object({
        items: z.array(z.object({ label: z.string(), value: z.string() })),
      }),
      slots: [],
      description:
        "Key-value list for displaying details like calendar info or appointment type info.",
    },
    Stack: {
      props: z.object({}),
      slots: ["default"],
      description:
        "Vertical layout container. Use as a wrapper to stack multiple components.",
    },
  },
});

export type AssistantCatalog = typeof assistantCatalog;
