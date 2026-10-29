### spec/realtime-propagation.md

GIVEN two browser sessions (dispatcher view, driver view) watching the same slot
WHEN the slot is claimed in the dispatcher view
THEN the driver view reflects "claimed" within 1 second with no manual reload
