-- Pin the append-only trigger function's namespace; preserve its rejection behavior.
alter function public.m1d_immutable() set search_path = '';
