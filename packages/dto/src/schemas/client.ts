import { z } from 'zod'
import { uuidSchema, timestampsSchema } from './common'

// Base client schema
export const clientSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().nullable(),
  phone: z.string().max(50).nullable(),
  ...timestampsSchema.shape,
})

// Create client input
export const createClientSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
})

// Update client input
export const updateClientSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
})

// List clients query
export const listClientsQuerySchema = z.object({
  search: z.string().optional(), // search by name or email
  cursor: uuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

// Response types
export const clientResponseSchema = clientSchema

// Inferred types
export type Client = z.infer<typeof clientSchema>
export type CreateClientInput = z.infer<typeof createClientSchema>
export type UpdateClientInput = z.infer<typeof updateClientSchema>
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>
export type ClientResponse = z.infer<typeof clientResponseSchema>
