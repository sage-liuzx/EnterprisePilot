import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const dateTime = tool(
  async ({ timezone }) => {
    try {
      const now = new Date();

      const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: timezone,
        dateStyle: "full",
        timeStyle: "long",
      });

      return formatter.format(now);
    } catch (error) {
      return `无法获取指定时区的时间：${timezone}`;
    }
  },
  {
    name: "date_time",
    description:
      "用于查询当前日期和时间。当用户询问今天是几号、星期几、当前时间或指定时区的当前时间时使用。",

    schema: z.object({
      timezone: z
        .string()
        .default("Asia/Shanghai")
        .describe(
          "IANA 时区名称，例如 Asia/Shanghai、Asia/Tokyo、America/New_York"
        ),
    }),
  }
);