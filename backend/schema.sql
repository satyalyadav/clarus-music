BEGIN;


CREATE TABLE IF NOT EXISTS public.album
(
    album_id serial NOT NULL,
    title character varying(50) COLLATE pg_catalog."default",
    release_date date,
    cover_image text COLLATE pg_catalog."default",
    artist_id integer NOT NULL,
    user_id integer NOT NULL,
    CONSTRAINT album_pkey PRIMARY KEY (album_id)
);

CREATE TABLE IF NOT EXISTS public.artist
(
    artist_id serial NOT NULL,
    name character varying(50) COLLATE pg_catalog."default" NOT NULL,
    user_id integer NOT NULL,
    CONSTRAINT artist_pkey PRIMARY KEY (artist_id)
);

CREATE TABLE IF NOT EXISTS public.genre
(
    genre_id serial NOT NULL,
    name character varying(50) COLLATE pg_catalog."default" NOT NULL,
    user_id integer NOT NULL,
    CONSTRAINT genre_pkey PRIMARY KEY (genre_id)
);

CREATE TABLE IF NOT EXISTS public.playlist
(
    playlist_id serial NOT NULL,
    title character varying(50) COLLATE pg_catalog."default" NOT NULL,
    cover_image text COLLATE pg_catalog."default",
    date_created date,
    user_id integer NOT NULL,
    CONSTRAINT playlist_pkey PRIMARY KEY (playlist_id)
);

CREATE TABLE IF NOT EXISTS public.playlist_song
(
    playlist_id integer NOT NULL,
    song_id integer NOT NULL,
    CONSTRAINT playlist_song_pkey PRIMARY KEY (playlist_id, song_id)
);

CREATE TABLE IF NOT EXISTS public.song
(
    song_id serial NOT NULL,
    title character varying(50) COLLATE pg_catalog."default" NOT NULL,
    artist_id integer NOT NULL,
    album_id integer,
    genre_id integer NOT NULL,
    duration interval NOT NULL,
    file_path text COLLATE pg_catalog."default" NOT NULL,
    user_id integer,
    CONSTRAINT song_pkey PRIMARY KEY (song_id)
);

CREATE TABLE IF NOT EXISTS public.users
(
    user_id serial NOT NULL,
    username character varying(20) COLLATE pg_catalog."default" NOT NULL,
    password text COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT users_pkey PRIMARY KEY (user_id),
    CONSTRAINT users_username_key UNIQUE (username)
);

ALTER TABLE IF EXISTS public.album
    ADD CONSTRAINT album_artist_id_fkey FOREIGN KEY (artist_id)
    REFERENCES public.artist (artist_id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.album
    ADD CONSTRAINT fk_album_user FOREIGN KEY (user_id)
    REFERENCES public.users (user_id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.artist
    ADD CONSTRAINT fk_artist_user FOREIGN KEY (user_id)
    REFERENCES public.users (user_id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.genre
    ADD CONSTRAINT fk_genre_user FOREIGN KEY (user_id)
    REFERENCES public.users (user_id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.playlist
    ADD CONSTRAINT playlist_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (user_id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.playlist_song
    ADD CONSTRAINT playlist_song_playlist_id_fkey FOREIGN KEY (playlist_id)
    REFERENCES public.playlist (playlist_id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.playlist_song
    ADD CONSTRAINT playlist_song_song_id_fkey FOREIGN KEY (song_id)
    REFERENCES public.song (song_id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.song
    ADD CONSTRAINT fk_song_user FOREIGN KEY (user_id)
    REFERENCES public.users (user_id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE CASCADE;


ALTER TABLE IF EXISTS public.song
    ADD CONSTRAINT song_album_id_fkey FOREIGN KEY (album_id)
    REFERENCES public.album (album_id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE SET NULL;


ALTER TABLE IF EXISTS public.song
    ADD CONSTRAINT song_genre_id_fkey FOREIGN KEY (genre_id)
    REFERENCES public.genre (genre_id) MATCH SIMPLE
    ON UPDATE NO ACTION
    ON DELETE RESTRICT;

END;