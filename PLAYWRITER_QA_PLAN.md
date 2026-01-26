# Playwriter QA Plan for Admin UI CRUD

This plan tests all CRUD operations in the scheduling admin UI using the Playwriter skill.

## Prerequisites

```bash
# Terminal 1: Start server with logging
pnpm dev:api > ./server.log 2>&1 &
pnpm dev:admin

# Terminal 2: Watch server logs for errors
tail -f ./server.log
```

## Test Execution

Run tests sequentially using `/playwriter` skill. After each action, check `./server.log` for API errors.

---

## Phase 1: Authentication

### Test 1.1: Login Flow
```
1. Navigate to http://localhost:5173
2. Verify redirect to /login if not authenticated
3. Fill email and password fields
4. Submit login form
5. Verify redirect to authenticated dashboard
```

**Expected:** User lands on authenticated area (dashboard or first route)

---

## Phase 2: Locations CRUD

### Test 2.1: Create Location
```
1. Navigate to /locations
2. Click "Add Location" button
3. Fill name: "Test Location 1"
4. Select timezone from dropdown
5. Submit form
6. Verify location appears in table
```

**Check server.log for:** `POST /v1/locations` - should return 201

### Test 2.2: Read Locations
```
1. Navigate to /locations
2. Verify table displays locations
3. Check columns: Name, Timezone, Created At
```

**Check server.log for:** `GET /v1/locations` - should return 200

### Test 2.3: Update Location
```
1. Navigate to /locations
2. Click edit button on existing location
3. Change name to "Updated Location"
4. Submit form
5. Verify updated name in table
```

**Check server.log for:** `PATCH /v1/locations/{id}` - should return 200

### Test 2.4: Delete Location
```
1. Navigate to /locations
2. Click delete button on location
3. Confirm deletion in dialog
4. Verify location removed from table
```

**Check server.log for:** `DELETE /v1/locations/{id}` - should return 200/204

---

## Phase 3: Calendars CRUD

### Test 3.1: Create Calendar
```
1. Navigate to /calendars
2. Click "Add Calendar" button
3. Fill name: "Test Calendar 1"
4. Select timezone
5. Optionally select a location
6. Submit form
7. Verify calendar appears in table
```

**Check server.log for:** `POST /v1/calendars` - should return 201

### Test 3.2: Read Calendars
```
1. Navigate to /calendars
2. Verify table displays calendars
3. Check columns: Name, Timezone, Location, Created At
```

### Test 3.3: Update Calendar
```
1. Navigate to /calendars
2. Click edit button on existing calendar
3. Change name and/or location
4. Submit form
5. Verify changes in table
```

### Test 3.4: Delete Calendar
```
1. Navigate to /calendars
2. Click delete button on calendar
3. Confirm deletion
4. Verify calendar removed from table
```

### Test 3.5: Set Calendar Availability
```
1. Navigate to /calendars
2. Click "Availability" link for a calendar
3. Verify navigates to /calendars/{id}/availability
4. Add availability block for Monday (e.g., 9:00 AM - 5:00 PM)
5. Set slot interval (e.g., 30 min)
6. Click Save
7. Verify success toast/message
```

**Check server.log for:** `POST /v1/availability/rules/setWeekly` - should return 200

---

## Phase 4: Resources CRUD

### Test 4.1: Create Resource
```
1. Navigate to /resources
2. Click "Add Resource" button
3. Fill name: "Test Resource 1"
4. Set quantity: 5
5. Optionally select location
6. Submit form
7. Verify resource appears in table
```

### Test 4.2: Read Resources
```
1. Navigate to /resources
2. Verify table displays resources
3. Check columns: Name, Quantity, Location, Created At
```

### Test 4.3: Update Resource
```
1. Navigate to /resources
2. Click edit on existing resource
3. Change quantity to 10
4. Submit form
5. Verify updated quantity in table
```

### Test 4.4: Delete Resource
```
1. Navigate to /resources
2. Click delete button
3. Confirm deletion
4. Verify resource removed
```

---

## Phase 5: Appointment Types CRUD

### Test 5.1: Create Appointment Type
```
1. Navigate to /appointment-types
2. Click "Add Appointment Type" button
3. Fill name: "Consultation"
4. Set duration: 30 (minutes)
5. Optionally set padding before/after
6. Submit form
7. Verify type appears in table
```

### Test 5.2: Read Appointment Types
```
1. Navigate to /appointment-types
2. Verify table displays types
3. Check columns: Name, Duration, Padding, Capacity
```

### Test 5.3: Update Appointment Type
```
1. Navigate to /appointment-types
2. Click edit on existing type
3. Change duration to 45
4. Submit form
5. Verify updated duration in table
```

### Test 5.4: Delete Appointment Type
```
1. Navigate to /appointment-types
2. Click delete button
3. Confirm deletion
4. Verify type removed
```

### Test 5.5: Link Calendar to Appointment Type
```
1. Navigate to /appointment-types
2. Click "Manage Calendars" for an appointment type
3. Verify navigates to /appointment-types/{id}/calendars
4. Select a calendar from dropdown
5. Click add/link button
6. Verify calendar appears in linked list
```

**Check server.log for:** `POST /v1/appointment-types/{id}/calendars` - should return 201

### Test 5.6: Unlink Calendar from Appointment Type
```
1. On /appointment-types/{id}/calendars page
2. Click delete/unlink on a linked calendar
3. Confirm if dialog appears
4. Verify calendar removed from linked list
```

### Test 5.7: Link Resource to Appointment Type
```
1. Navigate to /appointment-types/{id}/resources
2. Select a resource from dropdown
3. Set quantity required: 1
4. Click add/link button
5. Verify resource appears in linked list with quantity
```

### Test 5.8: Update Resource Quantity on Appointment Type
```
1. On /appointment-types/{id}/resources page
2. Change quantity field for a linked resource
3. Verify update saves (may be inline or on blur)
```

### Test 5.9: Unlink Resource from Appointment Type
```
1. On /appointment-types/{id}/resources page
2. Click delete/unlink on a linked resource
3. Verify resource removed from linked list
```

---

## Phase 6: Appointments

### Test 6.1: View Appointments List
```
1. Navigate to /appointments
2. Verify table displays (may be empty initially)
3. Check filter options: calendar, type, status, date range
```

### Test 6.2: Create New Appointment
**Prerequisites:** At least one appointment type linked to a calendar with availability set

```
1. Navigate to /appointments/new
2. Select an appointment type
3. Select a calendar (should show only linked calendars)
4. Select a date (today or future)
5. Wait for available time slots to load
6. Select a time slot
7. Optionally add notes
8. Click confirm/book button
9. Verify success - should redirect to appointments list
10. Verify new appointment in list
```

**Check server.log for:**
- `GET /v1/availability/times` - should return 200 with slots
- `POST /v1/appointments` - should return 201

### Test 6.3: Filter Appointments
```
1. Navigate to /appointments
2. Select a specific calendar filter
3. Verify list updates to show only that calendar's appointments
4. Change status filter to "scheduled"
5. Verify list filters correctly
```

### Test 6.4: Cancel Appointment
```
1. Navigate to /appointments
2. Find a scheduled appointment
3. Click Cancel button
4. Confirm cancellation in dialog
5. Verify appointment status changes to "cancelled" or removed
```

**Check server.log for:** `DELETE /v1/appointments/{id}` - should return 200/204

### Test 6.5: Mark Appointment as No-Show
```
1. Navigate to /appointments
2. Find a scheduled/confirmed appointment
3. Click "No Show" button
4. Confirm action
5. Verify status changes to "no_show"
```

**Check server.log for:** `POST /v1/appointments/{id}/no-show` - should return 200

---

## Phase 7: Edge Cases & Error Handling

### Test 7.1: Required Field Validation
```
1. Navigate to /locations
2. Click Add Location
3. Submit form without filling name
4. Verify validation error appears
```

### Test 7.2: Duplicate/Conflict Handling
```
1. Try creating entities with edge case data
2. Verify appropriate error messages
```

### Test 7.3: Delete with Dependencies
```
1. Try deleting a location that has calendars
2. Verify appropriate error or cascade behavior
```

### Test 7.4: No Available Slots
```
1. Navigate to /appointments/new
2. Select type/calendar with no availability set
3. Select a date
4. Verify "no slots available" message
```

---

## Common Issues to Watch For

1. **API Errors in server.log:**
   - 400 Bad Request - validation issues
   - 404 Not Found - missing resources
   - 500 Internal Server Error - backend bugs

2. **UI Issues:**
   - Forms not resetting after submit
   - Loading states not showing
   - Stale data (cache not invalidating)
   - Dropdowns not populating
   - Buttons not responding to clicks

3. **State Issues:**
   - Edit mode not exiting after save
   - Delete dialogs not closing
   - Toast notifications not appearing

---

## Playwriter Commands Reference

```bash
# Start session
/playwriter

# Navigate
open http://localhost:5173/locations

# Get interactive elements
snapshot -i

# Interact
click @e1
fill @e2 "Test Value"
select @e3 "option value"

# Verify
screenshot
snapshot -i

# Debug
console    # Check for JS errors

# End
close
```

## Test Results Tracking

| Test | Status | Notes |
|------|--------|-------|
| 1.1 Login | ⬜ | |
| 2.1 Create Location | ⬜ | |
| 2.2 Read Locations | ⬜ | |
| 2.3 Update Location | ⬜ | |
| 2.4 Delete Location | ⬜ | |
| 3.1 Create Calendar | ⬜ | |
| 3.2 Read Calendars | ⬜ | |
| 3.3 Update Calendar | ⬜ | |
| 3.4 Delete Calendar | ⬜ | |
| 3.5 Set Availability | ⬜ | |
| 4.1 Create Resource | ⬜ | |
| 4.2 Read Resources | ⬜ | |
| 4.3 Update Resource | ⬜ | |
| 4.4 Delete Resource | ⬜ | |
| 5.1 Create Appt Type | ⬜ | |
| 5.2 Read Appt Types | ⬜ | |
| 5.3 Update Appt Type | ⬜ | |
| 5.4 Delete Appt Type | ⬜ | |
| 5.5 Link Calendar | ⬜ | |
| 5.6 Unlink Calendar | ⬜ | |
| 5.7 Link Resource | ⬜ | |
| 5.8 Update Resource Qty | ⬜ | |
| 5.9 Unlink Resource | ⬜ | |
| 6.1 View Appointments | ⬜ | |
| 6.2 Create Appointment | ⬜ | |
| 6.3 Filter Appointments | ⬜ | |
| 6.4 Cancel Appointment | ⬜ | |
| 6.5 Mark No-Show | ⬜ | |
| 7.1 Required Fields | ⬜ | |
| 7.2 Duplicates | ⬜ | |
| 7.3 Delete Dependencies | ⬜ | |
| 7.4 No Available Slots | ⬜ | |
