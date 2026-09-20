import { tool } from "@langchain/core/tools";
import { z } from "zod";
// ==================== 2. 创建 Calculator Tool ====================
export const calculator = tool(
  async ({ a, b, operation }) => {
    let result: number;

    switch (operation) {
      case "add":
        result = a + b;
        break;

      case "subtract":
        result = a - b;
        break;

      case "multiply":
        result = a * b;
        break;

      case "divide":
        if (b === 0) {
          throw new Error("不能除以 0");
        }
        result = a / b;
        break;

      default:
        throw new Error("不支持的运算");
    }

    return String(result);
  },
  {
    name: "calculator",
    description:
      "用于进行数学计算。当用户需要进行加、减、乘、除运算时使用这个工具。operation 必须根据用户表达选择：- add：加法，例如 10 + 5; subtract：减法，例如 10 - 5; multiply：乘法，例如 10 × 5、10 * 5; divide：除法，例如 10 ÷ 5、10 / 5",
    schema: z.object({
      a: z.number().describe("第一个数字"),
      b: z.number().describe("第二个数字"),
      operation: z
        .enum(["add", "subtract", "multiply", "divide"])
        .describe("运算类型：add=加法，subtract=减法，multiply=乘法，divide=除法"),
    }),
  }
);