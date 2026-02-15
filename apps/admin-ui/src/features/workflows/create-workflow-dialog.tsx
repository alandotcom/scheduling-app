import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import {
  createWorkflowSchema,
  type SerializedWorkflowGraph,
} from "@scheduling/dto";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc } from "@/lib/query";

const nameSchema = createWorkflowSchema.pick({ name: true });
type NameFormValues = z.infer<typeof nameSchema>;

function createDefaultWorkflowGraph(): SerializedWorkflowGraph {
  const triggerId = crypto.randomUUID();

  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: triggerId,
        attributes: {
          id: triggerId,
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            label: "",
            description: "",
            type: "trigger",
            status: "idle",
            config: {
              triggerType: "DomainEvent",
              startEvents: [],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
    ],
    edges: [],
  };
}

interface CreateWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkflowDialog({
  open,
  onOpenChange,
}: CreateWorkflowDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NameFormValues>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: "" },
    mode: "onBlur",
  });

  useEffect(() => {
    if (open) {
      reset({ name: "" });
      // Auto-focus after dialog animation
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open, reset]);

  const createMutation = useMutation(
    orpc.workflows.create.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        onOpenChange(false);
        navigate({
          to: "/workflows/$workflowId",
          params: { workflowId: data.id },
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create workflow");
      },
    }),
  );

  const onSubmit = (values: NameFormValues) => {
    createMutation.mutate({
      name: values.name,
      graph: createDefaultWorkflowGraph(),
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <AlertDialogHeader>
            <AlertDialogTitle>Create workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Give your workflow a name to get started.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-4">
            <Label htmlFor="workflow-name">Name</Label>
            <Input
              id="workflow-name"
              placeholder="e.g. New client onboarding"
              {...register("name")}
              ref={(el) => {
                register("name").ref(el);
                inputRef.current = el;
              }}
              aria-invalid={!!errors.name}
            />
            {errors.name ? (
              <p className="mt-1 text-xs text-destructive">
                {errors.name.message}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit">
              {createMutation.isPending ? "Creating…" : "Create"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
