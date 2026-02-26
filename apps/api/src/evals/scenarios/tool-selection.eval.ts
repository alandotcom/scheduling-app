import { evalite } from "evalite";
import { defaultFixtures } from "../fixtures/index.js";
import { responseQualityScorer } from "../scorers/response-quality.js";
import { toolSelectionScorer } from "../scorers/tool-call.js";
import type { EvalInput, EvalOutput } from "../task.js";
import { runAssistant } from "../task.js";

evalite<
  EvalInput,
  EvalOutput,
  { expectedTools: string[]; forbiddenTools?: string[] }
>("Tool Selection — Lookup Queries", {
  data: () => [
    {
      input: {
        messages: [{ role: "user", content: "Find John Smith" }],
        fixtures: defaultFixtures,
      },
      expected: {
        expectedTools: ["findClients"],
        forbiddenTools: [
          "proposeBookAppointment",
          "proposeCancelAppointment",
          "proposeRescheduleAppointment",
        ],
      },
    },
    {
      input: {
        messages: [
          { role: "user", content: "What appointments are coming up?" },
        ],
        fixtures: defaultFixtures,
      },
      expected: {
        expectedTools: ["findAppointments"],
        forbiddenTools: ["proposeBookAppointment", "proposeCancelAppointment"],
      },
    },
    {
      input: {
        messages: [{ role: "user", content: "Show me Dr. Smith's calendar" }],
        fixtures: defaultFixtures,
      },
      expected: {
        expectedTools: ["findCalendars"],
      },
    },
    {
      input: {
        messages: [
          {
            role: "user",
            content: "What types of appointments do you offer?",
          },
        ],
        fixtures: defaultFixtures,
      },
      expected: {
        expectedTools: ["findAppointmentTypes"],
      },
    },
    {
      input: {
        messages: [
          {
            role: "user",
            content: "Is Dr. Smith free next Tuesday?",
          },
        ],
        fixtures: defaultFixtures,
      },
      expected: {
        expectedTools: ["findCalendars"],
        forbiddenTools: ["proposeBookAppointment"],
      },
    },
  ],
  task: async (input) => runAssistant(input),
  scorers: [toolSelectionScorer, responseQualityScorer],
});

evalite<
  EvalInput,
  EvalOutput,
  { expectedTools: string[]; forbiddenTools?: string[] }
>("Tool Selection — Action Intents", {
  data: () => [
    {
      input: {
        messages: [{ role: "user", content: "Cancel Ada's appointment" }],
        fixtures: defaultFixtures,
      },
      expected: {
        expectedTools: ["findClients", "proposeCancelAppointment"],
        forbiddenTools: ["proposeBookAppointment"],
      },
    },
    {
      input: {
        messages: [{ role: "user", content: "Confirm appointment for John" }],
        fixtures: defaultFixtures,
      },
      expected: {
        expectedTools: ["findClients", "proposeConfirmAppointment"],
        forbiddenTools: ["proposeCancelAppointment"],
      },
    },
    {
      input: {
        messages: [
          {
            role: "user",
            content: "Mark John's appointment as no-show",
          },
        ],
        fixtures: defaultFixtures,
      },
      expected: {
        expectedTools: ["findClients", "proposeNoShowAppointment"],
        forbiddenTools: ["proposeCancelAppointment", "proposeBookAppointment"],
      },
    },
  ],
  task: async (input) => runAssistant(input),
  scorers: [toolSelectionScorer, responseQualityScorer],
});
