export const stripHtml = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();

export function discoverDirectFacilityJobs(entries) {
  return entries.map((entry) => entry?.data || entry).filter((job) => job && job.country_code === 'US' && job.location_name?.endsWith('Distribution Center') && /distribution center/i.test(stripHtml(job.description)));
}

export function groupFacilityJobs(jobs) {
  const groups = new Map();
  for (const job of jobs) groups.set(job.location_name, [...(groups.get(job.location_name) || []), job]);
  return groups;
}

export function selectStrongestFacilityJob(jobs) {
  if (!jobs.length) throw new Error('Cannot select evidence from an empty facility job group');
  const score = (job) => ['street_address', 'city', 'state', 'postal_code', 'latitude', 'longitude'].filter((field) => job[field] !== null && job[field] !== undefined && job[field] !== '').length;
  return [...jobs].sort((a, b) => score(b) - score(a) || String(b.posted_date || '').localeCompare(String(a.posted_date || '')) || String(a.slug).localeCompare(String(b.slug)))[0];
}
