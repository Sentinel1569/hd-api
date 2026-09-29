/**
 * Pick-lists for the "+ LOG VEHICLE" modal (Day 17), for cars whose plate you
 * can't read. Use chips, not free typing: a vehicle without a plate is matched
 * on exactly these words, so "Silver" typed once as "silver-grey" wouldn't match.
 * Add local makes or colours freely — keep each spelling fixed once in use.
 */
export const VEHICLE_COLOURS = ['White', 'Black', 'Silver', 'Grey', 'Blue', 'Red', 'Green', 'Gold', 'Brown', 'Yellow', 'Other'];

export const BODY_TYPES = ['Saloon', 'SUV', 'Pickup', 'Hatchback', 'Van', 'Bus', 'Truck', 'Motorbike', 'Tricycle'];

/** Optional. Offer "Don't know" as well, which leaves the make empty. */
export const VEHICLE_MAKES = [
  'Toyota',
  'Lexus',
  'Honda',
  'Mercedes-Benz',
  'Hyundai',
  'Kia',
  'Ford',
  'Nissan',
  'Peugeot',
  'Volkswagen',
  'BMW',
  'Mitsubishi',
  'Other',
];
