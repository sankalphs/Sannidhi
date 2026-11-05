import type { TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import schema from "../schema";

/** Every table the schema declares — derived, so a new table can never be missed by a wipe. */
export const ALL_TABLES = Object.keys(schema.tables) as TableNames[];

/** Deletes up to `limit` rows from `table`; returns how many were deleted. */
export async function deleteRows(
  ctx: MutationCtx,
  table: TableNames,
  limit: number,
): Promise<number> {
  const rows = await ctx.db.query(table).take(limit);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}
