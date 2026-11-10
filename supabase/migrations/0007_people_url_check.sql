-- Defense in depth: app.people.profile_url may only ever be a canonical
-- https://www.linkedin.com/in/ URL. The worker already validates before insert,
-- but this stops any direct client insert from storing a javascript:/data: or
-- off-site URL that the UI might render into an href.
alter table app.people
  add constraint people_profile_url_linkedin
  check (profile_url ~ '^https://www\.linkedin\.com/in/');
