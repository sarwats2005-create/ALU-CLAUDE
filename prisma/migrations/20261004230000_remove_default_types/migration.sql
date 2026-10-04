-- Remove the aluminum types that used to be pre-added on every install (6061, 6063, Mixed, Scrap, Extrusion).
-- The factory adds its own types. A type that a product still uses is kept (deleting it would break that
-- product); it can be removed from Settings once no product uses it.
DELETE FROM "AluminumType" t
WHERE t."name" IN ('6061', '6063', 'Mixed', 'Scrap', 'Extrusion')
  AND NOT EXISTS (SELECT 1 FROM "Product" p WHERE p."typeId" = t."id");
