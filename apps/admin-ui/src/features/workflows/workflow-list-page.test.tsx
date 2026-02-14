/// <reference lib="dom" />

import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { WorkflowListResponse } from "@scheduling/dto";
import { WorkflowListPage } from "./workflow-list-page";

function createWorkflowListFixture(): WorkflowListResponse {
  return [
    {
      id: "0198c24e-9447-7ecf-b550-c84f56e1e111",
      orgId: "0198c24e-9447-7ecf-b550-c84f56e1e222",
      name: "Patient Intake",
      description: "Create follow-up tasks after a new client is created",
      visibility: "private",
      graph: {
        attributes: {},
        options: { type: "directed" },
        nodes: [
          {
            key: "trigger-node",
            attributes: {
              id: "trigger-node",
              type: "trigger-node",
              position: { x: 0, y: 0 },
              data: { label: "Trigger", type: "trigger" },
            },
          },
        ],
        edges: [],
      },
      createdAt: new Date("2026-02-14T20:00:00.000Z"),
      updatedAt: new Date("2026-02-14T21:00:00.000Z"),
    },
    {
      id: "0198c24e-9447-7ecf-b550-c84f56e1e333",
      orgId: "0198c24e-9447-7ecf-b550-c84f56e1e222",
      name: "Appointment Reminder",
      description: null,
      visibility: "public",
      graph: {
        attributes: {},
        options: { type: "directed" },
        nodes: [
          {
            key: "trigger-node-2",
            attributes: {
              id: "trigger-node-2",
              type: "trigger-node",
              position: { x: 0, y: 0 },
              data: { label: "Trigger", type: "trigger" },
            },
          },
        ],
        edges: [],
      },
      createdAt: new Date("2026-02-14T19:00:00.000Z"),
      updatedAt: new Date("2026-02-14T22:00:00.000Z"),
    },
  ];
}

describe("WorkflowListPage", () => {
  test("renders workflow data and admin write action for admin users", () => {
    render(
      <WorkflowListPage
        workflows={createWorkflowListFixture()}
        isLoading={false}
        canManageWorkflows={true}
      />,
    );

    expect(screen.getByText("Patient Intake")).toBeTruthy();
    expect(screen.getByText("Appointment Reminder")).toBeTruthy();
    expect(screen.getByText("private")).toBeTruthy();
    expect(screen.getByText("public")).toBeTruthy();

    const newWorkflowButton = screen.getByRole("button", {
      name: "New workflow",
    }) as HTMLButtonElement;
    expect(newWorkflowButton).toBeTruthy();
    expect(newWorkflowButton.disabled).toBe(true);
  });

  test("renders workflow data without write actions for member users", () => {
    render(
      <WorkflowListPage
        workflows={createWorkflowListFixture()}
        isLoading={false}
        canManageWorkflows={false}
      />,
    );

    expect(screen.getByText("Patient Intake")).toBeTruthy();
    expect(screen.getByText("Appointment Reminder")).toBeTruthy();
    expect(screen.getByText("Read-only access for your role.")).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "New workflow",
      }),
    ).toBeNull();
  });
});
