export type SoftwareCompanyTemplate = {
  key: "software_company";
  label: string;
  description: string;
  currency: "INR";
  proposalPipeline: {
    stages: Array<{
      id: string;
      name: string;
      probability: number;
      expectedCycleDays: number;
    }>;
    opportunities: Array<{
      id: string;
      client: string;
      title: string;
      stageId: string;
      value: number;
      proposedOn: string;
      expectedCloseDate: string;
      conversionPlan: {
        projectCode: string;
        milestones: Array<{
          code: string;
          label: string;
          dueDate: string;
          billingType: "advance" | "milestone" | "final";
          amount: number;
          invoicePlanned: boolean;
        }>;
      };
    }>;
  };
  serviceOrders: {
    orders: Array<{
      orderNo: string;
      client: string;
      model: "retainer" | "sprint" | "fixed_scope";
      startDate: string;
      endDate?: string;
      billingCadence: "monthly" | "bi-weekly" | "on_milestone";
      linkedSprintBillables: Array<{
        sprint: string;
        jiraEpic: string;
        deliverable: string;
        billableHours: number;
        billingAmount: number;
        status: "planned" | "in_progress" | "ready_to_invoice" | "invoiced";
      }>;
    }>;
  };
  workforce: {
    teamMembers: Array<{
      employeeCode: string;
      name: string;
      role: string;
      department: "engineering" | "product" | "design" | "qa" | "ops";
      employmentType: "full_time" | "contract";
      monthlyCostToCompany: number;
      billableTargetHours: number;
    }>;
    payrollRuns: Array<{
      runId: string;
      month: string;
      grossPay: number;
      deductions: number;
      netPay: number;
      payoutDate: string;
      status: "draft" | "processed" | "paid";
    }>;
    leaveRecords: Array<{
      employeeCode: string;
      leaveType: "annual" | "sick" | "comp_off";
      from: string;
      to: string;
      days: number;
      status: "approved" | "pending" | "rejected";
    }>;
  };
  clients: {
    segments: Array<{
      clientCode: string;
      name: string;
      geography: "domestic" | "export";
      taxProfile: {
        treatment: "igst" | "cgst_sgst" | "lut_export";
        reverseChargeApplicable: boolean;
        currency: "INR" | "USD" | "EUR";
      };
      activeContracts: number;
      arDays: number;
    }>;
  };
  kpiCards: Array<{
    id: string;
    title: string;
    value: string;
    formula: string;
    trend: "up" | "flat" | "down";
    insight: string;
  }>;
};

export const software_company: SoftwareCompanyTemplate = {
  key: "software_company",
  label: "Software Services Company",
  description:
    "Template for IT services firms running proposal-led sales, sprint execution, mixed tax clients, and workforce-heavy operations.",
  currency: "INR",
  proposalPipeline: {
    stages: [
      { id: "lead", name: "Lead Qualified", probability: 20, expectedCycleDays: 10 },
      { id: "solution", name: "Solution Draft", probability: 45, expectedCycleDays: 14 },
      { id: "commercial", name: "Commercial Review", probability: 70, expectedCycleDays: 8 },
      { id: "won", name: "Won", probability: 100, expectedCycleDays: 3 },
    ],
    opportunities: [
      {
        id: "OPP-SW-1021",
        client: "Borealis Retail Pvt Ltd",
        title: "Omnichannel Inventory Platform",
        stageId: "commercial",
        value: 2400000,
        proposedOn: "2026-02-04",
        expectedCloseDate: "2026-04-24",
        conversionPlan: {
          projectCode: "PRJ-BOR-2026-01",
          milestones: [
            {
              code: "MS-ADV",
              label: "Kickoff & Architecture Baseline",
              dueDate: "2026-05-05",
              billingType: "advance",
              amount: 480000,
              invoicePlanned: true,
            },
            {
              code: "MS-01",
              label: "Sprint 1-3 Core Services",
              dueDate: "2026-06-15",
              billingType: "milestone",
              amount: 960000,
              invoicePlanned: true,
            },
            {
              code: "MS-02",
              label: "UAT, Hypercare & Handover",
              dueDate: "2026-07-10",
              billingType: "final",
              amount: 960000,
              invoicePlanned: true,
            },
          ],
        },
      },
      {
        id: "OPP-SW-1035",
        client: "Nordbyte GmbH",
        title: "DataOps Automation Retainer",
        stageId: "solution",
        value: 1450000,
        proposedOn: "2026-03-10",
        expectedCloseDate: "2026-05-06",
        conversionPlan: {
          projectCode: "PRJ-NOR-RET-26",
          milestones: [
            {
              code: "MS-ADV",
              label: "Initial Discovery + Setup",
              dueDate: "2026-05-15",
              billingType: "advance",
              amount: 290000,
              invoicePlanned: true,
            },
            {
              code: "MS-01",
              label: "Monthly Retainer Month 1",
              dueDate: "2026-06-01",
              billingType: "milestone",
              amount: 580000,
              invoicePlanned: true,
            },
            {
              code: "MS-02",
              label: "Monthly Retainer Month 2",
              dueDate: "2026-07-01",
              billingType: "final",
              amount: 580000,
              invoicePlanned: true,
            },
          ],
        },
      },
    ],
  },
  serviceOrders: {
    orders: [
      {
        orderNo: "SO-SW-24017",
        client: "Borealis Retail Pvt Ltd",
        model: "fixed_scope",
        startDate: "2026-05-01",
        endDate: "2026-07-15",
        billingCadence: "on_milestone",
        linkedSprintBillables: [
          {
            sprint: "Sprint 12",
            jiraEpic: "BRL-INV-EP01",
            deliverable: "Inventory Sync API + Queue Processing",
            billableHours: 220,
            billingAmount: 352000,
            status: "ready_to_invoice",
          },
          {
            sprint: "Sprint 13",
            jiraEpic: "BRL-INV-EP04",
            deliverable: "Store Reconciliation Dashboard",
            billableHours: 180,
            billingAmount: 288000,
            status: "in_progress",
          },
        ],
      },
      {
        orderNo: "SO-SW-24022",
        client: "Nordbyte GmbH",
        model: "retainer",
        startDate: "2026-05-15",
        billingCadence: "monthly",
        linkedSprintBillables: [
          {
            sprint: "Sprint 31",
            jiraEpic: "NDB-OPS-EP03",
            deliverable: "ETL Reliability Improvements",
            billableHours: 140,
            billingAmount: 476000,
            status: "invoiced",
          },
          {
            sprint: "Sprint 32",
            jiraEpic: "NDB-OPS-EP06",
            deliverable: "Cost Optimizer + Observability Pack",
            billableHours: 128,
            billingAmount: 435200,
            status: "ready_to_invoice",
          },
        ],
      },
    ],
  },
  workforce: {
    teamMembers: [
      {
        employeeCode: "EMP-201",
        name: "Aarav Menon",
        role: "Tech Lead",
        department: "engineering",
        employmentType: "full_time",
        monthlyCostToCompany: 185000,
        billableTargetHours: 132,
      },
      {
        employeeCode: "EMP-219",
        name: "Jia Fernandes",
        role: "Senior Product Designer",
        department: "design",
        employmentType: "full_time",
        monthlyCostToCompany: 128000,
        billableTargetHours: 120,
      },
      {
        employeeCode: "CTR-042",
        name: "Pranav Khanna",
        role: "QA Automation Consultant",
        department: "qa",
        employmentType: "contract",
        monthlyCostToCompany: 96000,
        billableTargetHours: 96,
      },
    ],
    payrollRuns: [
      {
        runId: "PAY-2026-02",
        month: "2026-02",
        grossPay: 1620000,
        deductions: 228000,
        netPay: 1392000,
        payoutDate: "2026-02-28",
        status: "paid",
      },
      {
        runId: "PAY-2026-03",
        month: "2026-03",
        grossPay: 1685000,
        deductions: 241500,
        netPay: 1443500,
        payoutDate: "2026-03-31",
        status: "paid",
      },
      {
        runId: "PAY-2026-04",
        month: "2026-04",
        grossPay: 1702000,
        deductions: 245400,
        netPay: 1456600,
        payoutDate: "2026-04-30",
        status: "processed",
      },
    ],
    leaveRecords: [
      {
        employeeCode: "EMP-201",
        leaveType: "annual",
        from: "2026-03-20",
        to: "2026-03-24",
        days: 3,
        status: "approved",
      },
      {
        employeeCode: "EMP-219",
        leaveType: "sick",
        from: "2026-04-01",
        to: "2026-04-02",
        days: 2,
        status: "approved",
      },
      {
        employeeCode: "CTR-042",
        leaveType: "comp_off",
        from: "2026-04-15",
        to: "2026-04-15",
        days: 1,
        status: "pending",
      },
    ],
  },
  clients: {
    segments: [
      {
        clientCode: "CL-DOM-018",
        name: "Borealis Retail Pvt Ltd",
        geography: "domestic",
        taxProfile: {
          treatment: "cgst_sgst",
          reverseChargeApplicable: false,
          currency: "INR",
        },
        activeContracts: 2,
        arDays: 46,
      },
      {
        clientCode: "CL-EXP-004",
        name: "Nordbyte GmbH",
        geography: "export",
        taxProfile: {
          treatment: "lut_export",
          reverseChargeApplicable: false,
          currency: "EUR",
        },
        activeContracts: 1,
        arDays: 61,
      },
      {
        clientCode: "CL-EXP-009",
        name: "Brightwell Analytics Inc",
        geography: "export",
        taxProfile: {
          treatment: "igst",
          reverseChargeApplicable: false,
          currency: "USD",
        },
        activeContracts: 1,
        arDays: 39,
      },
    ],
  },
  kpiCards: [
    {
      id: "mrr_like_retainers",
      title: "MRR-like Retainers",
      value: "₹14.9L",
      formula: "Sum(active monthly retainers + normalized fixed retainers)",
      trend: "up",
      insight: "Retainer base expanded with one new EU client in March.",
    },
    {
      id: "utilization_proxy",
      title: "Utilization Proxy",
      value: "78%",
      formula: "Billable hours logged / billable target hours",
      trend: "flat",
      insight: "Design and QA are slightly under target while backend squads are over 85%.",
    },
    {
      id: "dso",
      title: "DSO (Days Sales Outstanding)",
      value: "49 days",
      formula: "(Accounts receivable / trailing 90-day credit sales) × 90",
      trend: "down",
      insight: "Collections improved after introducing milestone-linked reminders.",
    },
  ],
};

export default software_company;
