import { readonly } from 'vue'

/**
 * Counter bumped when the Hobby_Library changes outside the page that shows it
 * (an Undo from the app-wide toast). Pages that list hobbies watch it and
 * reload their lists from storage.
 */
export function useLibraryRevision() {
  const revision = useState<number>('pursio-library-revision', () => 0)

  function bump(): void {
    revision.value += 1
  }

  return { revision: readonly(revision), bump }
}
