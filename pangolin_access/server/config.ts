import { z } from 'zod';
import { apiUrlSchema } from './pangolin.js';

export const optionsSchema = z.strictObject({
  admin_user_ids: z.array(z.string().regex(/^[a-f0-9]{32}$/)).max(20),
  enable_certificate_management: z.boolean().optional(),
  pangolin_api_url: apiUrlSchema.optional(),
  home_assistant_origin: z.string().url().transform((value, context) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      context.addIssue({ code: 'custom', message: 'Enter only the Home Assistant HTTP(S) origin.' });
      return z.NEVER;
    }
    return url.origin;
  }),
}).superRefine((options, context) => {
  if (options.enable_certificate_management && !options.home_assistant_origin.startsWith('https://')) {
    context.addIssue({ code: 'custom', path: ['home_assistant_origin'], message: 'Certificate management requires an HTTPS Home Assistant origin.' });
  }
});

export type Options = z.output<typeof optionsSchema>;
