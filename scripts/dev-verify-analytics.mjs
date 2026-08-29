import { ConvexHttpClient } from "convex/browser";
import { SignJWT } from "jose";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient("https://polished-toucan-265.convex.cloud");

const admin = await client.query(api.demo.getDemoActor, { role: "admin" });
console.log("admin actor:", JSON.stringify(admin));

const secret = new TextEncoder().encode("local-dev-session-secret-0123456789");
const token = await new SignJWT({ userId: admin.userId, role: "admin" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .sign(secret);

const overview = await client.query(api.analytics.overview, { actorToken: token });
console.log("overview:", JSON.stringify(overview, null, 2));

const trajectories = await client.query(api.analytics.attendanceTrajectories, {
  actorToken: token,
});
for (const row of trajectories) {
  console.log(
    `${row.studentName}: ${row.summary.percentage}% held=${row.summary.totalHeld} trend=${row.trend} atRisk=${row.atRisk} misses=${row.consecutiveMisses} factors=${JSON.stringify(row.factors)}`,
  );
}

const trends = await client.query(api.analytics.sectionTrends, { actorToken: token });
for (const row of trends) {
  console.log(
    `${row.courseCode}: sessions=${row.sessionsHeld} enrolled=${row.enrolledCount} rate=${row.attendanceRatePct} late=${row.lateArrivals} flagged=${row.flaggedTotal} rejected=${row.rejectedTotal}`,
  );
}

const anomalies = await client.query(api.analytics.anomalyDashboard, { actorToken: token });
console.log("proxy:", JSON.stringify(anomalies.proxyAttempts));
console.log("verification:", JSON.stringify(anomalies.verification.byType));

const scan = await client.mutation(api.reviewAlerts.triggerScan, { actorToken: token });
console.log("scan:", JSON.stringify(scan));

const alerts = await client.query(api.reviewAlerts.listReviewAlerts, { actorToken: token });
for (const alert of alerts) {
  console.log(
    `alert ${alert.kind} [${alert.status}] ${alert.studentName}: ${JSON.stringify(alert.factors)}`,
  );
}

const monthly = await client.query(api.analytics.reportRows, {
  actorToken: token,
  period: "monthly",
});
console.log(
  `monthly report: ${monthly.rows.length} rows, summary=${JSON.stringify(monthly.summary)}`,
);
