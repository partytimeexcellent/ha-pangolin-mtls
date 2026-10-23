import { z } from 'zod';

export const optionsSchema = z.strictObject({
  admin_user_ids: z.array(z.string().regex(/^[a-f0-9]{32}$/)).max(20),
  home_assistant_origin: z.string().url().transform((value, context) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      context.addIssue({ code: 'custom', message: 'Enter only the Home Assistant HTTP(S) origin.' });
      return z.NEVER;
    }
    return url.origin;
  }),
});

export type Options = z.output<typeof optionsSchema>;
