import { tool } from "@langchain/core/tools";
import { z } from "zod";
import employees from "../data/employees.json" with { type: "json" };

interface Employee {
  employeeId: string;
  name: string;
  department: string;
  position: string;
  annualLeave: number;
  office: string;
}

export const employeeLookup = tool(
  async ({ employeeId, name }) => {
    const employeeList = employees as Employee[];

    let employee: Employee | undefined;

    if (employeeId) {
      employee = employeeList.find(
        (item) => item.employeeId === employeeId
      );
    }

    if (!employee && name) {
      employee = employeeList.find(
        (item) => item.name === name
      );
    }

    if (!employee) {
      return "未找到对应员工信息。";
    }

    return JSON.stringify(
      {
        employeeId: employee.employeeId,
        name: employee.name,
        department: employee.department,
        position: employee.position,
        annualLeave: employee.annualLeave,
        office: employee.office,
      },
      null,
      2
    );
  },
  {
    name: "employee_lookup",

    description:
      "用于查询企业员工的基本信息，例如部门、职位、办公地点和剩余年假。当用户询问某位员工的信息时使用。可以通过员工ID或姓名查询。",

    schema: z.object({
      employeeId: z
        .string()
        .optional()
        .describe("员工ID，例如 A1001"),

      name: z
        .string()
        .optional()
        .describe("员工姓名，例如 张伟"),
    }),
  }
);