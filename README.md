# query-with-cache

A lightweight, TypeScript-first caching solution for managing async query results. Inspired by React Query's patterns, it provides a simple yet powerful way to cache and invalidate data with support for stale-while-revalidate, automatic garbage collection, and hierarchical cache keys.

## Features

- 🚀 Simple, intuitive API
- 💾 In-memory caching with automatic garbage collection
- 🌳 Hierarchical cache keys
- ⚡ Stale-while-revalidate pattern
- 🔍 TypeScript-first design
- 🧹 Zero dependencies

## Installation

```bash
npm install query-with-cache
# or
yarn add query-with-cache
```

## Quick Start

```typescript
import { queryWithCache, CacheStoreInMemory } from 'query-with-cache';

// Create a cache instance
const cache = new CacheStoreInMemory();

// Basic usage
await queryWithCache({
  queryKey: ['todos'],
  cache,
  queryFn: () => fetch('/api/todos').then(r => r.json()),
  onData: (todos) => {
    console.log('Todos:', todos);
  },
  onIsFetching: (loading) => {
    console.log('Loading:', loading);
  },
  onError: (error) => {
    console.error('Error:', error);
  },
});
```

## Integration with Valtio

```typescript
import { proxy } from 'valtio';

// Define your state
interface State {
  todos: Todo[];
  isLoading: boolean;
  error: Error | null;
}

const state = proxy<State>({
  todos: [],
  isLoading: false,
  error: null,
});

// Create data fetching function
const fetchTodos = async () => {
  await queryWithCache({
    queryKey: ['todos'],
    cache,
    queryFn: () => fetch('/api/todos').then(r => r.json()),
    onData: (todos) => {
      state.todos = todos;
    },
    onIsFetching: (loading) => {
      state.isLoading = loading;
    },
    onError: (error) => {
      state.error = error as Error;
    },
  });
};

// Use with React
import { useSnapshot } from 'valtio';

function TodoList() {
  const snap = useSnapshot(state);

  useEffect(() => {
    fetchTodos();
  }, []);

  if (snap.isLoading) return <div>Loading...</div>;
  if (snap.error) return <div>Error: {snap.error.message}</div>;

  return (
    <ul>
      {snap.todos.map(todo => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

### Optimistic Updates with Valtio

```typescript
const addTodo = async (newTodo: Todo) => {
  // Optimistic update
  state.todos.push({ ...newTodo, id: 'temp-id' });

  try {
    await queryWithCache({
      queryKey: ['todos', 'add'],
      cache,
      queryFn: () => fetch('/api/todos', {
        method: 'POST',
        body: JSON.stringify(newTodo),
      }).then(r => r.json()),
      onData: (savedTodo) => {
        // Replace optimistic todo with server response
        const index = state.todos.findIndex(t => t.id === 'temp-id');
        if (index !== -1) {
          state.todos[index] = savedTodo;
        }
      },
      onError: () => {
        // Rollback on error
        state.todos = state.todos.filter(t => t.id !== 'temp-id');
      },
    });
  } catch (error) {
    // Handle error
    state.todos = state.todos.filter(t => t.id !== 'temp-id');
  }
};
```

## Basic Cache Operations

```typescript
// Set cache entry
cache.set({
  key: ['users', '123'],
  data: userData,
  staleTime: 5000,    // Optional: custom stale time
  cacheTime: 30000,   // Optional: custom cache time
});

// Get cache entry
const { data, stale } = cache.get(['users', '123']);

// Invalidate cache entries
cache.invalidate(['users', '123']);     // Single entry
cache.invalidate(['users']);            // Collection
```

## TypeScript Support

```typescript
interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

// Typed cache operations
const { data, stale } = cache.get<Todo>(['todos', '123']);

// Typed queries
await queryWithCache<Todo[]>({
  queryKey: ['todos'],
  queryFn: () => fetchTodos(),
  onData: (todos) => {
    // todos is typed as Todo[]
    console.log(todos[0].title);
  }
});
```

## Configuration

```typescript
const cache = new CacheStoreInMemory({
  // Default times
  defaultStaleTime: 5000,    // 5 seconds
  defaultCacheTime: 30000,   // 30 seconds
  
  // Garbage collection interval
  gcInterval: 60000,         // 1 minute
  
  // Debugging
  debug: true,
  logger: customLogger,
});
```

## Best Practices

1. **Cache Keys**
   ```typescript
   // Good
   ['users', userId, 'posts']
   ['todos', { status: 'active' }]

   // Avoid
   ['users', new Date()]  // Non-serializable
   ['data']              // Too generic
   ```

2. **Cache Times**
   - Set appropriate stale times based on data freshness needs
   - Configure cache times based on memory constraints
   - Use shorter times for frequently changing data

3. **Error Handling**
   - Always provide error handlers
   - Implement retry strategies if needed
   - Handle cache misses appropriately

